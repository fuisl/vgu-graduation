import type { FastifyPluginAsync } from "fastify";

/**
 * RSVP module (#34). Registered in server.ts already, so implementing it only
 * touches files in this directory. Follow modules/invitations for the layout:
 * routes (contract schemas via ZodTypeProvider), service, repository, tests.
 */
export const rsvpRoutes: FastifyPluginAsync = async () => {};
