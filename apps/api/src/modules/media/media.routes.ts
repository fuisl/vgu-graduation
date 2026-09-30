import fastifyMultipart from "@fastify/multipart";
import {
  errorResponseSchema,
  galleryResponseSchema,
  MEDIA_MAX_UPLOAD_BYTES,
  mediaVariantParamsSchema,
  moderateMediaResponseSchema,
  moderateRequestSchema,
  pageQuerySchema,
  uploadMediaResponseSchema,
} from "@grad/contract";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { invitationToken } from "../../auth/credentials.js";
import { StorageUnavailableError } from "../../storage/object-store.js";
import { requireAdmin } from "../admin/admin-auth.js";
import { MediaService } from "./media.service.js";

export interface MediaRoutesOptions {
  /** Override for tests; defaults to the database- and Garage-backed service. */
  service?: Pick<MediaService, "authorizeUpload" | "upload" | "listGallery" | "openDerivative" | "moderate">;
}

/** Seconds a guest is asked to wait before retrying when Garage is down. */
const STORAGE_RETRY_AFTER_SECONDS = 30;

/**
 * Derivative names carry a random id and never change content (#59), so
 * browsers may keep them forever. There is no edge cache in front (ADR-009).
 */
const DERIVATIVE_CACHE = "public, max-age=31536000, immutable";

/**
 * Gallery listing: identical for every guest but guest-only, so no shared cache;
 * a 60-second browser cache matches the Vercel layer's window (§4.1).
 */
const GALLERY_CACHE = "private, max-age=60";

function storageUnavailable(
  request: FastifyRequest,
  reply: FastifyReply,
  err: StorageUnavailableError,
  message: string,
) {
  const cause = err.cause as { name?: string; code?: string } | undefined;
  request.log.warn({ cause: cause?.code ?? cause?.name }, "object storage unavailable");
  return reply
    .header("Cache-Control", "no-store")
    .header("Retry-After", String(STORAGE_RETRY_AFTER_SECONDS))
    .status(503)
    .send({ error: "Service Unavailable", message });
}

/**
 * Media module: guest uploads straight to the API (#58, path B, traffic-paths.md
 * §3.2), the gallery listing, derivative serving and moderation (#60).
 */
export const mediaRoutes: FastifyPluginAsync<MediaRoutesOptions> = async (fastify, options) => {
  const service = options.service ?? new MediaService();

  // Registered inside this plugin, so multipart bodies are accepted on media routes only.
  // The 25 MB cap is enforced here while streaming, not by Traefik.
  await fastify.register(fastifyMultipart, {
    throwFileSizeLimit: false,
    limits: { fileSize: MEDIA_MAX_UPLOAD_BYTES, files: 1, fields: 5, parts: 6 },
  });

  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * POST /media: one image as multipart/form-data, streamed into grad-originals.
   * The type is sniffed from the bytes; the declared type and file name are ignored.
   */
  app.post(
    "/media",
    {
      schema: {
        response: {
          201: uploadMediaResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          410: errorResponseSchema,
          413: errorResponseSchema,
          415: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const token = invitationToken(request);
      if (!token) {
        return reply.status(401).send({
          error: "Unauthorized",
          message: "Missing invitation bearer token or session cookie",
        });
      }

      const uploader = await service.authorizeUpload(token);
      switch (uploader.status) {
        case "expired":
          return reply.status(410).send({ error: "Gone", message: "This invitation has expired" });
        case "invalid":
          return reply.status(404).send({ error: "Not Found", message: "Invalid or revoked invitation" });
        case "roll_finished":
          return reply
            .header("Connection", "close")
            .status(409)
            .send({ error: "Conflict", message: "All shots on this invitation's roll have been used" });
      }

      if (!request.isMultipart()) {
        return reply
          .status(400)
          .send({ error: "Bad Request", message: "Expected multipart/form-data with one image file" });
      }
      const part = await request.file();
      if (!part) {
        return reply.status(400).send({ error: "Bad Request", message: "No file in the upload" });
      }

      try {
        const result = await service.upload(uploader.invitationId, part.file);
        // After a rejected upload the rest of the body is unread: don't reuse the connection.
        if (result.status !== "ok") reply.header("Connection", "close");
        switch (result.status) {
          case "ok":
            request.log.info({ publicId: result.photo.publicId }, "photo uploaded");
            return reply.status(201).send(result.photo);
          case "roll_finished":
            return reply
              .status(409)
              .send({ error: "Conflict", message: "All shots on this invitation's roll have been used" });
          case "too_large":
            return reply.status(413).send({
              error: "Payload Too Large",
              message: `Photos can be at most ${MEDIA_MAX_UPLOAD_BYTES / (1024 * 1024)} MB`,
            });
          case "unsupported":
            return reply.status(415).send({
              error: "Unsupported Media Type",
              message: "Only JPEG, PNG and WebP photos can be uploaded",
            });
          case "empty":
            return reply.status(400).send({ error: "Bad Request", message: "The uploaded file is empty" });
        }
      } catch (err) {
        if (err instanceof StorageUnavailableError) {
          reply.header("Connection", "close");
          return storageUnavailable(
            request,
            reply,
            err,
            "Photo uploads are temporarily unavailable. Please try again in a moment.",
          );
        }
        throw err;
      }
    },
  );

  /** GET /gallery: visible, processed photos, newest first, for invited guests only (use-cases.md §6.2). */
  app.get(
    "/gallery",
    {
      schema: {
        querystring: pageQuerySchema,
        response: {
          200: galleryResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          410: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const token = invitationToken(request);
      if (!token) {
        return reply.status(401).send({
          error: "Unauthorized",
          message: "Missing invitation bearer token or session cookie",
        });
      }
      const result = await service.listGallery(token, request.query);
      switch (result.status) {
        case "expired":
          return reply.status(410).send({ error: "Gone", message: "This invitation has expired" });
        case "invalid":
          return reply.status(404).send({ error: "Not Found", message: "Invalid or revoked invitation" });
        case "ok":
          reply.header("Cache-Control", GALLERY_CACHE);
          return reply.status(200).send(result.page);
      }
    },
  );

  /**
   * GET /media/{publicId}/{variant}: streams one derivative from grad-derivatives.
   * No credential: the random id is the capability, so gallery pages, the event
   * display and the printer can load it. Only visible, ready photos; originals never.
   */
  app.get(
    "/media/:id/:variant",
    {
      schema: {
        params: mediaVariantParamsSchema,
        response: {
          // Streamed JPEG bytes: Fastify never runs a serializer on a stream.
          200: z.unknown(),
          400: errorResponseSchema,
          404: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id, variant } = request.params;
      let object;
      try {
        object = await service.openDerivative(id, variant);
      } catch (err) {
        if (err instanceof StorageUnavailableError) {
          return storageUnavailable(request, reply, err, "Photos are temporarily unavailable. Please try again in a moment.");
        }
        throw err;
      }
      if (!object) {
        // Never cached, so un-hiding a photo brings it back at once.
        return reply
          .header("Cache-Control", "no-store")
          .status(404)
          .send({ error: "Not Found", message: "Photo not found" });
      }
      reply
        .header("Content-Type", "image/jpeg")
        .header("Cache-Control", DERIVATIVE_CACHE)
        .header("X-Content-Type-Options", "nosniff")
        .header("Cross-Origin-Resource-Policy", "cross-origin");
      if (object.contentLength !== undefined) reply.header("Content-Length", String(object.contentLength));
      return reply.status(200).send(object.body);
    },
  );

  /**
   * POST /admin/media/{publicId}/moderate: hide (reversible), remove (takedown)
   * or restore a photo. Serving stops at once; audited.
   */
  app.post(
    "/admin/media/:id/moderate",
    {
      preHandler: requireAdmin,
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: moderateRequestSchema,
        response: {
          200: moderateMediaResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const result = await service.moderate(request.params.id, request.body.status, request.adminHandle ?? "unknown");
      if (!result) return reply.status(404).send({ error: "Not Found", message: "Photo not found" });
      request.log.info({ publicId: result.publicId, status: result.status }, "photo moderated");
      return reply.status(200).send(result);
    },
  );
};
