import {
  GRADUATE_INVITE_DAILY_LIMIT,
  GRADUATE_INVITE_DAILY_WINDOW_MS,
  GRADUATE_INVITE_LIMIT,
  GRADUATE_INVITE_WINDOW_MS,
  GRADUATE_REMOVE_LIMIT,
  GRADUATE_REMOVE_WINDOW_MS,
  errorResponseSchema,
  graduateGuestsResponseSchema,
  graduateInviteRequestSchema,
  graduateInviteResponseSchema,
  graduateMeResponseSchema,
  graduateRemoveGuestResponseSchema,
  graduateSessionResponseSchema,
  graduateSignInRequestSchema,
} from "@grad/contract";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { bearerToken } from "../../auth/credentials.js";
import { SlidingWindowLimiter } from "../mail/rate-limit.js";
import type { PortalGraduate } from "./graduate-portal.repository.js";
import { GraduatePortalService } from "./graduate-portal.service.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Set by the graduate guard on /graduate/* routes (ADR-017). */
    graduate?: PortalGraduate;
  }
}

export interface GraduatePortalRoutesOptions {
  /** Override for tests; defaults to the database- and SMTP-backed service. */
  service?: Pick<GraduatePortalService, "mailEnabled" | "signIn" | "authenticate" | "signOut" | "me" | "listGuests" | "invite" | "removeGuest">;
  /** Override for tests; defaults to GRADUATE_INVITE_LIMIT per graduate per hour. */
  inviteLimiter?: SlidingWindowLimiter;
  /** Override for tests; defaults to GRADUATE_INVITE_DAILY_LIMIT emails per day, portal-wide. */
  inviteDailyLimiter?: SlidingWindowLimiter;
  /** Override for tests; defaults to GRADUATE_REMOVE_LIMIT per graduate per hour. */
  removeLimiter?: SlidingWindowLimiter;
}

const PORTAL_KEY = "portal";
const unauthorized = { error: "Unauthorized", message: "Missing, invalid or expired graduate session" };
const unavailable = { error: "Service Unavailable", message: "Email is not available" };
const limited = { error: "Too Many Requests", message: "Too many requests, try again later" };
const notFound = { error: "Not Found", message: "Guest not found" };

/**
 * The graduate portal API (ADR-017). The credential is a session token as `Authorization: Bearer`,
 * sent by the web BFF. Cookies are deliberately never read here: the browser holds the portal cookie
 * on the web host only, so no ambient credential can reach these routes (no CSRF surface on this
 * host). An invitation token, an admin session or a join code is simply not a known session, so all
 * get 401. Every response is no-store (the server default); nothing logs a token, a name or an address.
 */
export const graduatePortalRoutes: FastifyPluginAsync<GraduatePortalRoutesOptions> = async (fastify, options) => {
  const service = options.service ?? new GraduatePortalService();
  const inviteLimiter = options.inviteLimiter ?? new SlidingWindowLimiter(GRADUATE_INVITE_LIMIT, GRADUATE_INVITE_WINDOW_MS);
  const inviteDailyLimiter = options.inviteDailyLimiter ?? new SlidingWindowLimiter(GRADUATE_INVITE_DAILY_LIMIT, GRADUATE_INVITE_DAILY_WINDOW_MS);
  const removeLimiter = options.removeLimiter ?? new SlidingWindowLimiter(GRADUATE_REMOVE_LIMIT, GRADUATE_REMOVE_WINDOW_MS);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  async function requireGraduate(request: FastifyRequest, reply: FastifyReply) {
    const token = bearerToken(request);
    const graduate = token ? await service.authenticate(token) : null;
    if (!graduate) return reply.status(401).send(unauthorized);
    request.graduate = graduate;
  }

  /**
   * POST /graduate/sessions: spends a sign-in token and returns a session token. Only the BFF's
   * confirmation step calls this, so opening the emailed link (GET, on the web host) spends nothing
   * and a mail scanner can't lock the graduate out. Not rate limited: a guess against a 128-bit token
   * is hopeless, each real token works once, and a shared limit would let strangers block sign-ins.
   */
  app.post(
    "/graduate/sessions",
    {
      schema: {
        body: graduateSignInRequestSchema,
        response: { 201: graduateSessionResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const session = await service.signIn(request.body.token);
      request.log.info({ graduateSignIn: session ? "ok" : "rejected" }, "graduate sign-in");
      if (!session) return reply.status(401).send({ error: "Unauthorized", message: "This sign-in link is not valid" });
      return reply.status(201).send(session);
    },
  );

  /** DELETE /graduate/sessions/current: signs out. The session stops working at once. */
  app.delete(
    "/graduate/sessions/current",
    { preHandler: requireGraduate, schema: { response: { 204: z.null(), 401: errorResponseSchema } } },
    async (request, reply) => {
      await service.signOut(request.graduate!);
      return reply.status(204).send(null);
    },
  );

  /** GET /graduate/me: name and join link. Issues the link if there is none; never replaces one. */
  app.get(
    "/graduate/me",
    { preHandler: requireGraduate, schema: { response: { 200: graduateMeResponseSchema, 401: errorResponseSchema } } },
    async (request, reply) => reply.status(200).send(await service.me(request.graduate!)),
  );

  /** GET /graduate/guests: only guests linked to this graduate through invitation_inviters. */
  app.get(
    "/graduate/guests",
    { preHandler: requireGraduate, schema: { response: { 200: graduateGuestsResponseSchema, 401: errorResponseSchema } } },
    async (request, reply) => reply.status(200).send({ items: await service.listGuests(request.graduate!.id) }),
  );

  /**
   * POST /graduate/guests: the join-link registration, without the code. Limited per graduate, with
   * a portal-wide daily budget of real emails so the sender's Gmail quota survives. An address that
   * was already invited sends nothing, so it gives the daily budget back but still counts per
   * graduate, which keeps the form from being a fast way to test addresses.
   */
  app.post(
    "/graduate/guests",
    {
      preHandler: requireGraduate,
      schema: {
        body: graduateInviteRequestSchema,
        response: {
          201: graduateInviteResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          429: errorResponseSchema,
          502: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!service.mailEnabled) return reply.status(503).send(unavailable);
      const graduateId = request.graduate!.id;
      if (!inviteLimiter.take(graduateId)) return reply.status(429).send(limited);
      if (!inviteDailyLimiter.take(PORTAL_KEY)) {
        inviteLimiter.refund(graduateId);
        return reply.status(429).send(limited);
      }
      const outcome = await service.invite(graduateId, request.body);
      request.log.info({ graduateId, graduateInvite: outcome }, "graduate invite");
      switch (outcome) {
        case "invited":
          return reply.status(201).send({ status: "invited" });
        case "already_invited":
          inviteDailyLimiter.refund(PORTAL_KEY);
          return reply.status(201).send({ status: "already_invited" });
        case "not_configured":
          inviteLimiter.refund(graduateId);
          inviteDailyLimiter.refund(PORTAL_KEY);
          return reply.status(503).send(unavailable);
        case "send_failed":
          inviteLimiter.refund(graduateId);
          inviteDailyLimiter.refund(PORTAL_KEY);
          return reply.status(502).send({ error: "Bad Gateway", message: "The invitation email could not be sent" });
      }
    },
  );

  /**
   * DELETE /graduate/guests/:id: takes this graduate off the guest's inviters, revoking the
   * invitation if nobody is left (ADR-017). 404, never 403, for someone else's guest or an unknown
   * id, so the answer doesn't confirm that an invitation exists.
   */
  app.delete(
    "/graduate/guests/:id",
    {
      preHandler: requireGraduate,
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: graduateRemoveGuestResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const graduateId = request.graduate!.id;
      if (!removeLimiter.take(graduateId)) return reply.status(429).send(limited);
      const outcome = await service.removeGuest(graduateId, request.params.id);
      request.log.info({ graduateId, invitationId: request.params.id, graduateRemove: outcome ?? "not_found" }, "graduate remove guest");
      if (!outcome) return reply.status(404).send(notFound);
      return reply.status(200).send({ outcome });
    },
  );
};
