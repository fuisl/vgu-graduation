import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { bearerToken } from "./credentials.js";
import { safeEqual } from "./tokens.js";

export type ServiceScope = keyof typeof config.serviceTokens;

declare module "fastify" {
  interface FastifyRequest {
    /** GitHub handle, set by `requireAdmin`. */
    adminHandle?: string;
    /** Service name, set by `requireService`. */
    serviceName?: ServiceScope;
  }
}

/**
 * preHandler for internal routes (`/internal/*`, service WebSockets). Each service
 * has its own static token from Secrets and can only enter routes guarded with its
 * own scope, so a leaked translation token can't drive the print queue.
 * A scope with no configured token rejects everything (fails closed).
 */
export function requireService(
  scope: ServiceScope,
  tokens: Record<ServiceScope, string | undefined> = config.serviceTokens,
) {
  return async function serviceGuard(request: FastifyRequest, reply: FastifyReply) {
    const expected = tokens[scope];
    const presented = bearerToken(request);
    if (!expected || !presented || !safeEqual(presented, expected)) {
      return reply.status(401).send({ error: "Unauthorized", message: "Invalid service token" });
    }
    request.serviceName = scope;
  };
}
