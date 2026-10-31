import {
  JOIN_LIMIT,
  JOIN_LINK_REQUEST_LIMIT,
  JOIN_LINK_REQUEST_WINDOW_MS,
  JOIN_WINDOW_MS,
  errorResponseSchema,
  joinCodeSchema,
  joinInfoSchema,
  joinLinkRequestSchema,
  joinLinkResponseSchema,
  joinRequestSchema,
  joinResponseSchema,
  rotateJoinLinkResponseSchema,
} from "@grad/contract";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAdmin } from "../admin/admin-auth.js";
import { SlidingWindowLimiter } from "../mail/rate-limit.js";
import { JoinService } from "./join.service.js";

export interface JoinRoutesOptions {
  /** Override for tests; defaults to the database- and SMTP-backed service. */
  service?: Pick<JoinService, "mailEnabled" | "info" | "requestLink" | "register" | "rotate">;
  /** Override for tests; defaults to JOIN_LINK_REQUEST_LIMIT per address per day. */
  linkLimiter?: SlidingWindowLimiter;
  /** Override for tests; defaults to JOIN_LIMIT per join link per hour. */
  joinLimiter?: SlidingWindowLimiter;
}

const unavailable = { error: "Service Unavailable", message: "Email is not available" };
const unknownLink = { error: "Not Found", message: "Unknown join link" };

/**
 * Guest self-registration (ADR-015). Public routes: a graduate asks for their join link, and
 * guests register through it. Every response is no-store (the server default) and nothing logs
 * an address or a code: ids and outcomes only.
 */
export const joinRoutes: FastifyPluginAsync<JoinRoutesOptions> = async (fastify, options) => {
  const service = options.service ?? new JoinService();
  const linkLimiter = options.linkLimiter ?? new SlidingWindowLimiter(JOIN_LINK_REQUEST_LIMIT, JOIN_LINK_REQUEST_WINDOW_MS);
  const joinLimiter = options.joinLimiter ?? new SlidingWindowLimiter(JOIN_LIMIT, JOIN_WINDOW_MS);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * POST /join-links/request: 202 whatever the address, answered before the lookup and the send,
   * so neither the body nor the timing tells a stranger who is a graduate. Over the per-address
   * limit the request is dropped quietly, so it can't be used to flood a graduate's inbox.
   */
  app.post(
    "/join-links/request",
    {
      schema: {
        body: joinLinkRequestSchema,
        response: { 202: joinLinkResponseSchema, 400: errorResponseSchema, 503: errorResponseSchema },
      },
    },
    async (request, reply) => {
      if (!service.mailEnabled) return reply.status(503).send(unavailable);
      if (linkLimiter.take(request.body.email)) {
        const log = request.log;
        service.requestLink(request.body).then(
          (outcome) => log.info({ joinLinkEmail: outcome }, "join link request"),
          (error: unknown) => log.error({ err: error }, "join link request failed"),
        );
      }
      return reply.status(202).send({ status: "accepted" });
    },
  );

  /** GET /join/:code: the inviting graduate's name for the guest form; 404 for an unknown code. */
  app.get(
    "/join/:code",
    {
      schema: {
        params: z.object({ code: joinCodeSchema }),
        response: { 200: joinInfoSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const info = await service.info(request.params.code);
      if (!info) return reply.status(404).send(unknownLink);
      return reply.status(200).send(info);
    },
  );

  /** POST /join/:code: registers a guest and emails their invitation. See joinResponseSchema for the statuses. */
  app.post(
    "/join/:code",
    {
      schema: {
        params: z.object({ code: joinCodeSchema }),
        body: joinRequestSchema,
        response: {
          201: joinResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          429: errorResponseSchema,
          502: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!service.mailEnabled) return reply.status(503).send(unavailable);
      const { code } = request.params;
      if (!joinLimiter.take(code)) {
        return reply.status(429).send({ error: "Too Many Requests", message: "Too many registrations on this link, try again later" });
      }
      const outcome = await service.register(code, request.body);
      request.log.info({ joinOutcome: outcome }, "join registration");
      switch (outcome) {
        case "registered":
          return reply.status(201).send({ status: "registered" });
        case "unknown_code":
          joinLimiter.refund(code);
          return reply.status(404).send(unknownLink);
        case "not_configured":
          joinLimiter.refund(code);
          return reply.status(503).send(unavailable);
        case "send_failed":
          joinLimiter.refund(code);
          return reply.status(502).send({ error: "Bad Gateway", message: "The invitation email could not be sent" });
      }
    },
  );

  /** POST /admin/graduates/:id/join-link: replaces a graduate's join link; the old one stops working. */
  app.post(
    "/admin/graduates/:id/join-link",
    {
      preHandler: requireAdmin,
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: rotateJoinLinkResponseSchema, 401: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const joinUrl = await service.rotate(request.params.id, request.adminHandle ?? "unknown");
      if (!joinUrl) return reply.status(404).send({ error: "Not Found", message: "Graduate not found" });
      return reply.status(200).send({ joinUrl });
    },
  );
};
