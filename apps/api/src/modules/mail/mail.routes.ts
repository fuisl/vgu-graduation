import {
  CALENDAR_EMAIL_LIMIT,
  CALENDAR_EMAIL_WINDOW_MS,
  calendarEmailRequestSchema,
  calendarEmailResponseSchema,
  errorResponseSchema,
  mailStatusResponseSchema,
} from "@grad/contract";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { invitationToken } from "../../auth/credentials.js";
import { InvitationsService } from "../invitations/invitations.service.js";
import { MailService } from "./mail.service.js";
import { SlidingWindowLimiter } from "./rate-limit.js";

export interface MailRoutesOptions {
  /** Override for tests; defaults to the SMTP mailer from config. */
  service?: Pick<MailService, "enabled" | "sendCalendarInvite">;
  /** Override for tests; defaults to the database-backed service. */
  invitationsService?: Pick<InvitationsService, "resolveByToken">;
  /** Override for tests; defaults to CALENDAR_EMAIL_LIMIT per invitation per day. */
  limiter?: SlidingWindowLimiter;
}

/**
 * Mail module (ADR-012): GET /mail/status and POST /calendar/email. The other two
 * emails ride on existing routes: the invitation link on issue and rotate, the
 * RSVP confirmation as a worker job queued by PUT /rsvp.
 */
export const mailRoutes: FastifyPluginAsync<MailRoutesOptions> = async (fastify, options) => {
  const service = options.service ?? new MailService();
  const invitations = options.invitationsService ?? new InvitationsService();
  const limiter = options.limiter ?? new SlidingWindowLimiter(CALENDAR_EMAIL_LIMIT, CALENDAR_EMAIL_WINDOW_MS);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /** GET /mail/status: lets the site hide email forms while mail is off. Public, no personal data. */
  app.get("/mail/status", { schema: { response: { 200: mailStatusResponseSchema } } }, async (_request, reply) => {
    reply.header("Cache-Control", "public, s-maxage=60, stale-while-revalidate=60");
    return reply.status(200).send({ enabled: service.enabled });
  });

  /** POST /calendar/email: the venue page's "Get the calendar invite by email". Invitation credential required. */
  app.post(
    "/calendar/email",
    {
      schema: {
        body: calendarEmailRequestSchema,
        response: {
          200: calendarEmailResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          410: errorResponseSchema,
          429: errorResponseSchema,
          502: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      if (!service.enabled) {
        return reply.status(503).send({ error: "Service Unavailable", message: "Email is not available" });
      }
      const token = invitationToken(request);
      if (!token) {
        return reply.status(401).send({ error: "Unauthorized", message: "Missing invitation bearer token or session cookie" });
      }
      const resolved = await invitations.resolveByToken(token);
      if (resolved.status === "expired") {
        return reply.status(410).send({ error: "Gone", message: "This invitation has expired" });
      }
      if (resolved.status === "invalid") {
        return reply.status(404).send({ error: "Not Found", message: "Invalid or revoked invitation" });
      }

      const invitationId = resolved.invitation.id;
      if (!limiter.take(invitationId)) {
        return reply.status(429).send({ error: "Too Many Requests", message: "Too many calendar emails for this invitation today" });
      }
      const result = await service.sendCalendarInvite({ to: request.body.email, locale: request.body.locale });
      // Ids and the outcome only: the address never reaches a log.
      request.log.info({ invitationId, emailStatus: result }, "calendar invite email");
      if (result === "sent") return reply.status(200).send({ status: "sent" });
      limiter.refund(invitationId);
      if (result === "not_configured") {
        return reply.status(503).send({ error: "Service Unavailable", message: "Email is not available" });
      }
      return reply.status(502).send({ error: "Bad Gateway", message: "The email could not be sent" });
    },
  );
};
