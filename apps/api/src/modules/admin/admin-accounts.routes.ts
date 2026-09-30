import {
  adminAccessSchema,
  adminAccountDecisionSchema,
  adminAccountSchema,
  adminAccountsResponseSchema,
  errorResponseSchema,
  githubHandleSchema,
} from "@grad/contract";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { StoredAdminAccount } from "./admin-accounts.repository.js";
import { requireAdmin, requireAdminIdentity, requireOwner } from "./admin-auth.js";
import { isOwner } from "./owners.js";

function toAccount(row: StoredAdminAccount) {
  return {
    handle: row.githubHandle,
    status: row.status,
    owner: isOwner(row.githubHandle),
    requestedAt: row.requestedAt.toISOString(),
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

const decisionParamsSchema = z.object({ handle: githubHandleSchema, decision: adminAccountDecisionSchema });

/** Admin access requests and owner approval (#119). Uses the store decorated as `adminAccounts`. */
export const adminAccountsRoutes: FastifyPluginAsync = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * POST /admin/access: called by apps/web right after GitHub sign-in with a
   * freshly minted session. Needs a valid session but not approval: the first
   * call files a pending request. Web only sets the session cookie when the
   * answer is `approved`.
   */
  app.post(
    "/admin/access",
    {
      preHandler: requireAdminIdentity,
      schema: { response: { 200: adminAccessSchema, 401: errorResponseSchema } },
    },
    async (request, reply) => {
      const handle = request.adminHandle!;
      reply.header("Cache-Control", "no-store");
      if (isOwner(handle)) return reply.send({ handle, status: "approved", owner: true });
      const status = await app.adminAccounts.requestAccess(handle);
      return reply.send({ handle, status, owner: false });
    },
  );

  /** GET /admin/me: the signed-in admin's handle and whether they are an owner. */
  app.get(
    "/admin/me",
    {
      preHandler: requireAdmin,
      schema: { response: { 200: adminAccessSchema, 401: errorResponseSchema, 403: errorResponseSchema } },
    },
    async (request, reply) => {
      const handle = request.adminHandle!;
      reply.header("Cache-Control", "no-store");
      return reply.send({ handle, status: "approved", owner: isOwner(handle) });
    },
  );

  /** GET /admin/accounts (owners): every account including pending requests, newest first. */
  app.get(
    "/admin/accounts",
    {
      preHandler: requireOwner,
      schema: { response: { 200: adminAccountsResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema } },
    },
    async (_request, reply) => {
      const rows = await app.adminAccounts.list();
      reply.header("Cache-Control", "no-store");
      return reply.send({ items: rows.map(toAccount) });
    },
  );

  /**
   * POST /admin/accounts/:handle/:decision (owners): approve, reject or revoke.
   * 404 for a handle that never signed in, 409 when the decision does not apply
   * to the account's current state or the account is an owner.
   */
  app.post(
    "/admin/accounts/:handle/:decision",
    {
      preHandler: requireOwner,
      schema: {
        params: decisionParamsSchema,
        response: {
          200: adminAccountSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { handle, decision } = request.params;
      if (isOwner(handle)) {
        return reply.status(409).send({ error: "Conflict", message: "Owners' access can't be changed here" });
      }
      const result = await app.adminAccounts.decide(handle, decision, request.adminHandle!);
      if (result.status === "not_found") {
        return reply.status(404).send({ error: "Not Found", message: "No sign-in from this GitHub account" });
      }
      if (result.status === "conflict") {
        return reply
          .status(409)
          .send({ error: "Conflict", message: `Can't ${decision} an account that is ${result.current}` });
      }
      return reply.send(toAccount(result.account));
    },
  );
};
