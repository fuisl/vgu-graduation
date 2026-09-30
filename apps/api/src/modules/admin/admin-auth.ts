import type { FastifyReply, FastifyRequest } from "fastify";
import { bearerToken } from "../../auth/credentials.js";
import type { AdminAccountStore } from "./admin-accounts.repository.js";
import { verifyAdminSession } from "./admin-session.js";
import { isOwner } from "./owners.js";

declare module "fastify" {
  interface FastifyInstance {
    /** Admin access store, decorated in buildServer (#119). */
    adminAccounts: AdminAccountStore;
  }
}

/** Verifies the session token only: who is calling, not whether they are approved. Sets request.adminHandle. */
export async function requireAdminIdentity(request: FastifyRequest, reply: FastifyReply) {
  const token = bearerToken(request);

  if (!token) {
    return reply.status(401).send({ error: "Unauthorized", message: "Missing admin session token" });
  }

  const session = await verifyAdminSession(token);
  if (!session) {
    return reply.status(401).send({ error: "Unauthorized", message: "Invalid or expired admin session" });
  }

  request.adminHandle = session.handle.toLowerCase();
}

/**
 * Fastify preHandler guarding /admin/* routes: a valid session for an owner or
 * an approved account. Approval is read on every request, so a revoke applies
 * immediately rather than when the 1-hour session expires.
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  await requireAdminIdentity(request, reply);
  if (reply.sent) return reply;

  const handle = request.adminHandle!;
  if (isOwner(handle)) return;
  if ((await request.server.adminAccounts.getStatus(handle)) === "approved") return;
  return reply.status(403).send({ error: "Forbidden", message: "This GitHub account is not an approved admin" });
}

/** preHandler for admin management: an owner only. */
export async function requireOwner(request: FastifyRequest, reply: FastifyReply) {
  await requireAdminIdentity(request, reply);
  if (reply.sent) return reply;

  if (!isOwner(request.adminHandle!)) {
    return reply.status(403).send({ error: "Forbidden", message: "Only owners can manage admins" });
  }
}
