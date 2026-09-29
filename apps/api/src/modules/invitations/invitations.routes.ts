import {
  createInvitationRequestSchema,
  createInvitationResponseSchema,
  errorResponseSchema,
  invitationSchema,
  rotateInvitationResponseSchema,
} from "@grad/contract";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { invitationToken } from "../../auth/credentials.js";
import { requireAdmin } from "../admin/admin-auth.js";
import { InvitationsService } from "./invitations.service.js";

export function invitationsRoutes(
  service: InvitationsService = new InvitationsService(),
): FastifyPluginAsync {
  return async (fastify) => {
    const app = fastify.withTypeProvider<ZodTypeProvider>();

    /**
     * GET /invitations/me
     * Resolves the current guest's invitation from a Bearer token or the `inv` cookie.
     */
    app.get(
      "/invitations/me",
      {
        schema: {
          response: {
            200: invitationSchema,
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

        const result = await service.resolveByToken(token);
        if (result.status === "expired") {
          return reply.status(410).send({ error: "Gone", message: "This invitation has expired" });
        }
        if (result.status === "invalid") {
          return reply
            .status(404)
            .send({ error: "Not Found", message: "Invalid or revoked invitation" });
        }

        // Vercel can cache up to 60s, tagged with the invitation
        reply.header("Cache-Control", "public, s-maxage=60, stale-while-revalidate=30");
        return reply.status(200).send(result.invitation);
      },
    );

    /** POST /admin/invitations: creates an invitation, returning its raw token once. */
    app.post(
      "/admin/invitations",
      {
        preHandler: requireAdmin,
        schema: {
          body: createInvitationRequestSchema,
          response: { 201: createInvitationResponseSchema, 401: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const result = await service.issueInvitation(request.body);
        return reply.status(201).send(result);
      },
    );

    /** POST /admin/invitations/:id/rotate: invalidates the previous token and issues a new one. */
    app.post(
      "/admin/invitations/:id/rotate",
      {
        preHandler: requireAdmin,
        schema: {
          params: z.object({ id: z.string().uuid() }),
          response: {
            200: rotateInvitationResponseSchema,
            401: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const result = await service.rotateInvitationToken(request.params.id);
        if (!result) {
          return reply
            .status(404)
            .send({ error: "Not Found", message: "Invitation not found or inactive" });
        }
        return reply.status(200).send(result);
      },
    );
  };
}
