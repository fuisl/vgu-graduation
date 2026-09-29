import type { FastifyPluginAsync } from "fastify";

/**
 * Signed pass module (#35). Registered in server.ts already, so implementing it only
 * touches files in this directory. Follow modules/invitations for the layout:
 * routes (contract schemas via ZodTypeProvider), service, repository, tests.
 */
export const passRoutes: FastifyPluginAsync = async () => {};
