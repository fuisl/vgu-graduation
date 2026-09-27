import type { FastifyPluginAsync } from "fastify";
import { InvitationsService } from "./invitations.service.js";
import type { CreateInvitationDTO } from "./invitations.types.js";

const service = new InvitationsService();

export const invitationsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /invitations/me
   * Resolves the current guest's invitation using Bearer token or 'inv' cookie.
   */
  fastify.get("/invitations/me", async (request, reply) => {
    let token: string | undefined;

    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    } else if (request.cookies?.inv) {
      token = request.cookies.inv;
    }

    if (!token) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Missing invitation bearer token or session cookie",
      });
    }

    const invitation = await service.resolveByToken(token);
    if (!invitation) {
      return reply.status(404).send({
        error: "Not Found",
        message: "Invalid, expired, or revoked invitation",
      });
    }

    // Cache header: Vercel can cache up to 60s tagged with invitation:{id}
    reply.header("Cache-Control", "public, s-maxage=60, stale-while-revalidate=30");
    return reply.status(200).send(invitation);
  });

  /**
   * POST /admin/invitations
   * Creates an invitation, generates a 128-bit bearer token, and stores sha256(token).
   */
  fastify.post<{ Body: CreateInvitationDTO }>(
    "/admin/invitations",
    async (request, reply) => {
      const { guestName, guestEmail, guestPhone, inviterUserIds, maxPlusOnes } =
        request.body || {};

      if (!guestName || typeof guestName !== "string") {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Field 'guestName' is required",
        });
      }

      if (!Array.isArray(inviterUserIds) || inviterUserIds.length === 0) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Field 'inviterUserIds' must be a non-empty array of user UUIDs",
        });
      }

      try {
        const result = await service.issueInvitation({
          guestName,
          guestEmail,
          guestPhone,
          inviterUserIds,
          maxPlusOnes: maxPlusOnes ?? 0,
        });

        return reply.status(201).send(result);
      } catch (err: any) {
        request.log.error(err);
        return reply.status(500).send({
          error: "Internal Server Error",
          message: "Failed to create invitation",
        });
      }
    }
  );

  /**
   * POST /admin/invitations/:id/rotate
   * Invalidates previous token and issues a new one.
   */
  fastify.post<{ Params: { id: string } }>(
    "/admin/invitations/:id/rotate",
    async (request, reply) => {
      const { id } = request.params;
      const result = await service.rotateInvitationToken(id);

      if (!result) {
        return reply.status(404).send({
          error: "Not Found",
          message: "Invitation not found or inactive",
        });
      }

      return reply.status(200).send(result);
    }
  );
};
