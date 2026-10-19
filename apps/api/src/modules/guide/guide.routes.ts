import {
  adminGuideItemSchema,
  adminGuideItemsResponseSchema,
  adminInvitationGuideResponseSchema,
  createGuideItemRequestSchema,
  errorResponseSchema,
  guestGuideResponseSchema,
  putInvitationGuideRequestSchema,
  updateGuideItemRequestSchema,
} from "@grad/contract";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { invitationToken } from "../../auth/credentials.js";
import { requireAdmin } from "../admin/admin-auth.js";
import { GuideService } from "./guide.service.js";

export interface GuideRoutesOptions {
  /** Override for tests; defaults to the database-backed service. */
  service?: Pick<
    GuideService,
    "guideByToken" | "listItems" | "createItem" | "updateItem" | "deleteItem" | "invitationGuide" | "setInvitationGuide"
  >;
}

/**
 * The guide is per invitation and behind the invitation credential, so nothing
 * may store it: a revoked or expired invitation must stop showing it at once.
 */
const GUEST_GUIDE_CACHE = "private, no-store";

const idParams = z.object({ id: z.string().uuid() });
const notFound = (what: string) => ({ error: "Not Found", message: `${what} not found` });

/** Guest guide-book module (#140): the guest's guide and the admin catalogue and picks. */
export const guideRoutes: FastifyPluginAsync<GuideRoutesOptions> = async (fastify, options) => {
  const service = options.service ?? new GuideService();
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /** GET /invitations/me/guide: places and things to do, picked for this guest or the defaults. */
  app.get(
    "/invitations/me/guide",
    {
      schema: {
        response: {
          200: guestGuideResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          410: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const token = invitationToken(request);
      if (!token) {
        return reply
          .status(401)
          .send({ error: "Unauthorized", message: "Missing invitation bearer token or session cookie" });
      }
      const result = await service.guideByToken(token);
      if (result.status === "expired") return reply.status(410).send({ error: "Gone", message: "This invitation has expired" });
      if (result.status === "invalid") return reply.status(404).send({ error: "Not Found", message: "Invalid or revoked invitation" });
      reply.header("Cache-Control", GUEST_GUIDE_CACHE);
      return reply.status(200).send(result.guide);
    },
  );

  /** GET /admin/guide/items: the whole catalogue, inactive items included. */
  app.get(
    "/admin/guide/items",
    {
      preHandler: requireAdmin,
      schema: { response: { 200: adminGuideItemsResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema } },
    },
    async (_request, reply) => {
      reply.header("Cache-Control", "no-store");
      return reply.status(200).send(await service.listItems());
    },
  );

  /** POST /admin/guide/items: adds an item. */
  app.post(
    "/admin/guide/items",
    {
      preHandler: requireAdmin,
      schema: {
        body: createGuideItemRequestSchema,
        response: { 201: adminGuideItemSchema, 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      return reply.status(201).send(await service.createItem(request.body, request.adminHandle ?? "unknown"));
    },
  );

  /** PATCH /admin/guide/items/{id}: edits, deactivates or reorders an item. */
  app.patch(
    "/admin/guide/items/:id",
    {
      preHandler: requireAdmin,
      schema: {
        params: idParams,
        body: updateGuideItemRequestSchema,
        response: {
          200: adminGuideItemSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const item = await service.updateItem(request.params.id, request.body, request.adminHandle ?? "unknown");
      if (!item) return reply.status(404).send(notFound("Guide item"));
      return reply.status(200).send(item);
    },
  );

  /** DELETE /admin/guide/items/{id}: removes an item and every pick of it. */
  app.delete(
    "/admin/guide/items/:id",
    {
      preHandler: requireAdmin,
      schema: {
        params: idParams,
        response: { 204: z.null(), 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      if (!(await service.deleteItem(request.params.id, request.adminHandle ?? "unknown"))) {
        return reply.status(404).send(notFound("Guide item"));
      }
      return reply.status(204).send(null);
    },
  );

  /** GET /admin/invitations/{id}/guide: the picks and what the guest currently sees. */
  app.get(
    "/admin/invitations/:id/guide",
    {
      preHandler: requireAdmin,
      schema: {
        params: idParams,
        response: {
          200: adminInvitationGuideResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const guide = await service.invitationGuide(request.params.id);
      if (!guide) return reply.status(404).send(notFound("Invitation"));
      return reply.status(200).send(guide);
    },
  );

  /** PUT /admin/invitations/{id}/guide: replaces the picks; an empty list goes back to the defaults. */
  app.put(
    "/admin/invitations/:id/guide",
    {
      preHandler: requireAdmin,
      schema: {
        params: idParams,
        body: putInvitationGuideRequestSchema,
        response: {
          200: adminInvitationGuideResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const result = await service.setInvitationGuide(request.params.id, request.body.itemIds, request.adminHandle ?? "unknown");
      switch (result.status) {
        case "not_found":
          return reply.status(404).send(notFound("Invitation"));
        case "unknown_items":
          return reply.status(400).send({ error: "Bad Request", message: "One or more guide items do not exist" });
        case "ok":
          return reply.status(200).send(result.guide);
      }
    },
  );
};
