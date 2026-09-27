import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyAdminSession } from "./admin-session.js";

/** Fastify preHandler guarding /admin/* routes. Attaches request.adminHandle on success. */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;

  if (!token) {
    return reply.status(401).send({ error: "Unauthorized", message: "Missing admin session token" });
  }

  const session = await verifyAdminSession(token);
  if (!session) {
    return reply.status(401).send({ error: "Unauthorized", message: "Invalid or expired admin session" });
  }

  (request as FastifyRequest & { adminHandle?: string }).adminHandle = session.handle;
}
