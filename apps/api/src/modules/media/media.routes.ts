import fastifyMultipart from "@fastify/multipart";
import {
  errorResponseSchema,
  MEDIA_MAX_UPLOAD_BYTES,
  uploadMediaResponseSchema,
} from "@grad/contract";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { invitationToken } from "../../auth/credentials.js";
import { StorageUnavailableError } from "../../storage/object-store.js";
import { MediaService } from "./media.service.js";

export interface MediaRoutesOptions {
  /** Override for tests; defaults to the database- and Garage-backed service. */
  service?: Pick<MediaService, "authorizeUpload" | "upload">;
}

/** Seconds a guest is asked to wait before retrying when Garage is down. */
const STORAGE_RETRY_AFTER_SECONDS = 30;

/** Media module (#58): guest uploads straight to the API (path B, traffic-paths.md §3.2). */
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
          const cause = err.cause as { name?: string; code?: string } | undefined;
          request.log.warn({ cause: cause?.code ?? cause?.name }, "object storage unavailable, upload rejected");
          return reply
            .header("Connection", "close")
            .header("Retry-After", String(STORAGE_RETRY_AFTER_SECONDS))
            .status(503)
            .send({
              error: "Service Unavailable",
              message: "Photo uploads are temporarily unavailable. Please try again in a moment.",
            });
        }
        throw err;
      }
    },
  );
};
