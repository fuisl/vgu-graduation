import {
  adminWishesResponseSchema,
  createWishRequestSchema,
  createWishResponseSchema,
  errorResponseSchema,
  moderateRequestSchema,
  moderateWishResponseSchema,
  pageQuerySchema,
  wishesResponseSchema,
} from "@grad/contract";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { invitationToken } from "../../auth/credentials.js";
import { requireAdmin } from "../admin/admin-auth.js";
import { InvalidCursorError, WishesService } from "./wishes.service.js";

/** Wishes change often on the day: the Vercel layer revalidates every 30 seconds (architecture §4.1). */
const PUBLIC_CACHE = "public, s-maxage=30, stale-while-revalidate=30";

const badCursor = { error: "Bad Request", message: "Invalid cursor" };

export interface WishesRoutesOptions {
  /** Override for tests; defaults to the database-backed service. */
  service?: Pick<WishesService, "createByToken" | "listVisible" | "listAll" | "moderate">;
}

/** Wishes module (#61): guest POST /wishes, public GET /wishes, admin listing and moderation. */
export const wishesRoutes: FastifyPluginAsync<WishesRoutesOptions> = async (fastify, options) => {
  const service = options.service ?? new WishesService();
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /** POST /wishes: a guest leaves a wish; visible at once, moderated afterwards. Never cached. */
  app.post(
    "/wishes",
    {
      schema: {
        body: createWishRequestSchema,
        response: {
          201: createWishResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          410: errorResponseSchema,
          429: errorResponseSchema,
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

      const result = await service.createByToken(token, request.body);
      switch (result.status) {
        case "expired":
          return reply.status(410).send({ error: "Gone", message: "This invitation has expired" });
        case "invalid":
          return reply.status(404).send({ error: "Not Found", message: "Invalid or revoked invitation" });
        case "rate_limited":
          return reply
            .status(429)
            .header("Retry-After", String(result.retryAfterSeconds))
            .send({ error: "Too Many Requests", message: "Too many wishes from this invitation, try again later" });
        case "ok":
          return reply.status(201).send(result.wish);
      }
    },
  );

  /** GET /wishes: visible wishes, newest first. Public: wishes are shown on the event display anyway. */
  app.get(
    "/wishes",
    {
      schema: {
        querystring: pageQuerySchema,
        response: { 200: wishesResponseSchema, 400: errorResponseSchema },
      },
    },
    async (request, reply) => {
      try {
        const page = await service.listVisible(request.query);
        reply.header("Cache-Control", PUBLIC_CACHE);
        return reply.status(200).send(page);
      } catch (err) {
        if (err instanceof InvalidCursorError) return reply.status(400).send(badCursor);
        throw err;
      }
    },
  );

  /** GET /admin/wishes: every wish in any state, for moderation. */
  app.get(
    "/admin/wishes",
    {
      preHandler: requireAdmin,
      schema: {
        querystring: pageQuerySchema,
        response: { 200: adminWishesResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        return reply.status(200).send(await service.listAll(request.query));
      } catch (err) {
        if (err instanceof InvalidCursorError) return reply.status(400).send(badCursor);
        throw err;
      }
    },
  );

  /** POST /admin/wishes/{id}/moderate: show, hide (reversible) or remove (takedown). Audited. */
  app.post(
    "/admin/wishes/:id/moderate",
    {
      preHandler: requireAdmin,
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: moderateRequestSchema,
        response: {
          200: moderateWishResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const result = await service.moderate(request.params.id, request.body.status, request.adminHandle ?? "unknown");
      if (result.status === "not_found") {
        return reply.status(404).send({ error: "Not Found", message: "Wish not found" });
      }
      return reply.status(200).send(result.wish);
    },
  );
};
