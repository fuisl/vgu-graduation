import type { FastifyPluginAsync } from "fastify";

/**
 * Event configuration, calendar feed and admin editing module (#33). Registered in server.ts already, so implementing it only
 * touches files in this directory. Follow modules/invitations for the layout:
 * routes (contract schemas via ZodTypeProvider), service, repository, tests.
 */
export const eventRoutes: FastifyPluginAsync = async () => {};
