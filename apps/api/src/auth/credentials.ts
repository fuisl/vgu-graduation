import type { FastifyRequest } from "fastify";

/** Name of the HttpOnly cookie carrying the invitation token from browsers (ADR-003). */
export const INVITATION_COOKIE = "inv";

/** Extracts a `Bearer` token from the Authorization header, if present. */
export function bearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length).trim() || undefined;
}

/**
 * Invitation credential: `Authorization: Bearer` from Vercel, or the parent-domain
 * cookie from browsers talking to the API directly. The header wins when both exist.
 */
export function invitationToken(request: FastifyRequest): string | undefined {
  return bearerToken(request) ?? (request.cookies?.[INVITATION_COOKIE] || undefined);
}
