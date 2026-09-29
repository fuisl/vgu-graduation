import type { FastifyReply, FastifyRequest } from "fastify";
import { bearerToken } from "../../auth/credentials.js";
import { verifyAdminSession } from "./admin-session.js";

/** Fastify preHandler guarding /admin/* routes. Attaches request.adminHandle on success. */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const token = bearerToken(request);

  if (!token) {
    return reply.status(401).send({ error: "Unauthorized", message: "Missing admin session token" });
  }

  const session = await verifyAdminSession(token);
  if (!session) {
    return reply.status(401).send({ error: "Unauthorized", message: "Invalid or expired admin session" });
  }

  request.adminHandle = session.handle;
}
