import {
  adminPrintJobsQuerySchema,
  adminPrintJobsResponseSchema,
  completePrintJobRequestSchema,
  completePrintJobResponseSchema,
  createPrintJobRequestSchema,
  createPrintJobResponseSchema,
  errorResponseSchema,
  nextPrintJobResponseSchema,
  retryPrintJobResponseSchema,
} from "@grad/contract";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { bearerToken, invitationToken } from "../../auth/credentials.js";
import { requireService } from "../../auth/service-auth.js";
import { type Config, config as defaultConfig } from "../../config.js";
import { requireAdmin } from "../admin/admin-auth.js";
import { verifyAdminSession } from "../admin/admin-session.js";
import { isOwner } from "../admin/owners.js";
import { InvalidPrintCursorError, type PrintRequester, PrintService } from "./print.service.js";

export interface PrintRoutesOptions {
  config?: Config;
  /** Override for tests; defaults to the database-backed service. */
  service?: Pick<PrintService, "create" | "claimNext" | "complete" | "retry" | "list">;
}

type RequesterResult = { status: "ok"; requester: PrintRequester } | { status: "forbidden" } | { status: "missing" };

/**
 * POST /print/jobs takes either credential. A bearer that verifies as an admin
 * session is an admin (approval checked like requireAdmin); anything else is
 * treated as a guest's invitation token (bearer or `inv` cookie).
 */
async function identify(request: FastifyRequest): Promise<RequesterResult> {
  const bearer = bearerToken(request);
  if (bearer) {
    const session = await verifyAdminSession(bearer);
    if (session) {
      const handle = session.handle.toLowerCase();
      if (isOwner(handle) || (await request.server.adminAccounts.getStatus(handle)) === "approved") {
        request.adminHandle = handle;
        return { status: "ok", requester: { kind: "admin", handle } };
      }
      return { status: "forbidden" };
    }
  }
  const token = invitationToken(request);
  if (!token) return { status: "missing" };
  return { status: "ok", requester: { kind: "guest", token } };
}

/**
 * Print module (#72, experimental). Requests land in the durable `print_jobs`
 * queue; the venue printer daemon polls `/internal/print/*` with the `printer`
 * service token. Nothing here touches event-critical flows: with the daemon
 * absent the queue simply waits.
 */
export const printRoutes: FastifyPluginAsync<PrintRoutesOptions> = async (fastify, options) => {
  const config = options.config ?? defaultConfig;
  const service = options.service ?? new PrintService();
  const printerOnly = requireService("printer", config.serviceTokens);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /** POST /print/jobs: an admin, or a guest when enabled, queues a print of a visible photo. */
  app.post(
    "/print/jobs",
    {
      schema: {
        body: createPrintJobRequestSchema,
        response: {
          201: createPrintJobResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          410: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const who = await identify(request);
      if (who.status === "missing") {
        return reply.status(401).send({ error: "Unauthorized", message: "Missing admin session or invitation credential" });
      }
      if (who.status === "forbidden") {
        return reply.status(403).send({ error: "Forbidden", message: "This GitHub account is not an approved admin" });
      }

      const result = await service.create(who.requester, request.body);
      switch (result.status) {
        case "guest_disabled":
          return reply.status(403).send({ error: "Forbidden", message: "Guests can't request prints at the moment" });
        case "invalid":
          return reply.status(404).send({ error: "Not Found", message: "Invalid or revoked invitation" });
        case "expired":
          return reply.status(410).send({ error: "Gone", message: "This invitation has expired" });
        case "too_many_copies":
          return reply.status(400).send({ error: "Bad Request", message: "Guests can print one copy at a time" });
        case "photo_not_found":
          return reply.status(404).send({ error: "Not Found", message: "Photo not found" });
        case "photo_not_printable":
          return reply.status(409).send({ error: "Conflict", message: "Only visible, processed photos can be printed" });
        case "rate_limited":
          return reply
            .status(429)
            .header("Retry-After", String(result.retryAfterSeconds))
            .send({ error: "Too Many Requests", message: "Too many prints from this invitation, try again later" });
        case "ok":
          request.log.info({ printJobId: result.job.id, requestedBy: who.requester.kind }, "print job queued");
          return reply.status(201).send(result.job);
      }
    },
  );

  /** GET /internal/print/jobs/next: the daemon claims the oldest queued job (or gets null). */
  app.get(
    "/internal/print/jobs/next",
    {
      preHandler: printerOnly,
      schema: { response: { 200: nextPrintJobResponseSchema, 401: errorResponseSchema } },
    },
    async (_request, reply) => {
      reply.header("Cache-Control", "no-store");
      return reply.status(200).send({ job: await service.claimNext() });
    },
  );

  /** POST /internal/print/jobs/{id}/done: the daemon reports a print as done or failed. */
  app.post(
    "/internal/print/jobs/:id/done",
    {
      preHandler: printerOnly,
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: completePrintJobRequestSchema,
        response: {
          200: completePrintJobResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const result = await service.complete(request.params.id, request.body);
      switch (result.status) {
        case "not_found":
          return reply.status(404).send({ error: "Not Found", message: "Print job not found" });
        case "conflict":
          return reply.status(409).send({ error: "Conflict", message: `The job is already ${result.current}` });
        case "ok":
          return reply.status(200).send(result.job);
      }
    },
  );

  /** GET /admin/print/jobs: the queue, newest first, with counts by status. */
  app.get(
    "/admin/print/jobs",
    {
      preHandler: requireAdmin,
      schema: {
        querystring: adminPrintJobsQuerySchema,
        response: { 200: adminPrintJobsResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        return reply.status(200).send(await service.list(request.query));
      } catch (err) {
        if (err instanceof InvalidPrintCursorError) return reply.status(400).send({ error: "Bad Request", message: "Invalid cursor" });
        throw err;
      }
    },
  );

  /** POST /admin/print/jobs/{id}/retry: re-queues a failed job. Audited as `print.retry`. */
  app.post(
    "/admin/print/jobs/:id/retry",
    {
      preHandler: requireAdmin,
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: retryPrintJobResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const result = await service.retry(request.params.id, request.adminHandle ?? "unknown");
      switch (result.status) {
        case "not_found":
          return reply.status(404).send({ error: "Not Found", message: "Print job not found" });
        case "conflict":
          return reply.status(409).send({ error: "Conflict", message: `Only failed jobs can be retried (this one is ${result.current})` });
        case "ok":
          return reply.status(200).send(result.job);
      }
    },
  );
};
