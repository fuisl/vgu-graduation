import {
  adminRsvpListResponseSchema,
  errorResponseSchema,
  putRsvpRequestSchema,
  putRsvpResponseSchema,
} from "@grad/contract";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { invitationToken } from "../../auth/credentials.js";
import { requireAdmin } from "../admin/admin-auth.js";
import { RsvpService } from "./rsvp.service.js";

export interface RsvpRoutesOptions {
  /** Override for tests; defaults to the database-backed service. */
  service?: Pick<RsvpService, "putByToken" | "listAll">;
}

/** RSVP module (#34): guest PUT /rsvp and admin GET /admin/rsvp. */
export const rsvpRoutes: FastifyPluginAsync<RsvpRoutesOptions> = async (fastify, options) => {
  const service = options.service ?? new RsvpService();
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /** PUT /rsvp: the guest creates or replaces their answer. Never cached. */
  app.put(
    "/rsvp",
    {
      schema: {
        body: putRsvpRequestSchema,
        response: {
          200: putRsvpResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          410: errorResponseSchema,
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

      const result = await service.putByToken(token, request.body);
      switch (result.status) {
        case "expired":
          return reply.status(410).send({ error: "Gone", message: "This invitation has expired" });
        case "invalid":
          return reply
            .status(404)
            .send({ error: "Not Found", message: "Invalid or revoked invitation" });
        case "over_limit":
          return reply.status(400).send({
            error: "Bad Request",
            message: `plusOnesCount exceeds the ${result.maxPlusOnes} allowed for this invitation`,
          });
        case "ok":
          return reply.status(200).send(result.rsvp);
      }
    },
  );

  /** GET /admin/rsvp: every invitation with its answer (guest PII, admin only). */
  app.get(
    "/admin/rsvp",
    {
      preHandler: requireAdmin,
      schema: { response: { 200: adminRsvpListResponseSchema, 401: errorResponseSchema } },
    },
    async (_request, reply) => {
      reply.header("Cache-Control", "no-store");
      return reply.status(200).send(await service.listAll());
    },
  );
};
