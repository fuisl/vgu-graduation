import {
  adminAccessibilityResponseSchema,
  adminRsvpListResponseSchema,
  errorResponseSchema,
  getRsvpResponseSchema,
  putRsvpRequestSchema,
  putRsvpResponseSchema,
} from "@grad/contract";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { invitationToken } from "../../auth/credentials.js";
import { requireAdmin } from "../admin/admin-auth.js";
import { RsvpService } from "./rsvp.service.js";

export interface RsvpRoutesOptions {
  /** Override for tests; defaults to the database-backed service. */
  service?: Pick<RsvpService, "putByToken" | "getByToken" | "listAll" | "listAccessibility">;
}

const missingCredential = {
  error: "Unauthorized",
  message: "Missing invitation bearer token or session cookie",
};

function invitationError(reply: FastifyReply, status: "invalid" | "expired") {
  return status === "expired"
    ? reply.status(410).send({ error: "Gone", message: "This invitation has expired" })
    : reply.status(404).send({ error: "Not Found", message: "Invalid or revoked invitation" });
}

/**
 * RSVP module (#34, #176): guest PUT and GET /rsvp, admin GET /admin/rsvp and
 * GET /admin/rsvp/accessibility. Accessibility needs are sensitive: every
 * route here is `no-store`, and none logs a body.
 */
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
      if (!token) return reply.status(401).send(missingCredential);

      const result = await service.putByToken(token, request.body);
      switch (result.status) {
        case "expired":
        case "invalid":
          return invitationError(reply, result.status);
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

  /**
   * GET /rsvp: the guest reads back their own answer, including accessibility
   * needs. Never cached, unlike GET /invitations/me, which carries no needs.
   */
  app.get(
    "/rsvp",
    {
      schema: {
        response: {
          200: getRsvpResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          410: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const token = invitationToken(request);
      if (!token) return reply.status(401).send(missingCredential);

      const result = await service.getByToken(token);
      if (result.status !== "ok") return invitationError(reply, result.status);
      return reply.status(200).send({ rsvp: result.rsvp });
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

  /** GET /admin/rsvp/accessibility: stated needs and event counts (#176). Sensitive, admin only. */
  app.get(
    "/admin/rsvp/accessibility",
    {
      preHandler: requireAdmin,
      schema: {
        response: { 200: adminAccessibilityResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema },
      },
    },
    async (_request, reply) => {
      reply.header("Cache-Control", "no-store");
      return reply.status(200).send(await service.listAccessibility());
    },
  );
};
