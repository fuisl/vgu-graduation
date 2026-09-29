import type { FastifyPluginAsync } from "fastify";

/**
 * Graduates (inviters) admin module (#32). Registered in server.ts already, so implementing it only
 * touches files in this directory. Follow modules/invitations for the layout:
 * routes (contract schemas via ZodTypeProvider), service, repository, tests.
 */
export const graduatesRoutes: FastifyPluginAsync = async () => {};
