import {
  createGraduateRequestSchema,
  errorResponseSchema,
  graduateSchema,
  graduatesResponseSchema,
  updateGraduateRequestSchema,
} from "@grad/contract";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAdmin } from "../admin/admin-auth.js";
import { DuplicateGraduateError } from "./graduates.repository.js";
import { GraduatesService } from "./graduates.service.js";

/** Graduates (inviters) admin module (#32). Graduates never sign in; admins add them one at a time. */
export function graduatesRoutes(
  service: GraduatesService = new GraduatesService(),
): FastifyPluginAsync {
  return async (fastify) => {
    const app = fastify.withTypeProvider<ZodTypeProvider>();

    /** GET /admin/graduates: every graduate sorted by name. Contains emails, so never cached. */
    app.get(
      "/admin/graduates",
      {
        preHandler: requireAdmin,
        schema: { response: { 200: graduatesResponseSchema, 401: errorResponseSchema } },
      },
      async (_request, reply) => {
        const result = await service.listGraduates();
        reply.header("Cache-Control", "no-store");
        return reply.status(200).send(result);
      },
    );

    /** POST /admin/graduates: adds one graduate; 409 when the email already exists. */
    app.post(
      "/admin/graduates",
      {
        preHandler: requireAdmin,
        schema: {
          body: createGraduateRequestSchema,
          response: {
            201: graduateSchema,
            401: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        try {
          const graduate = await service.createGraduate(request.body, request.adminHandle ?? "unknown");
          return reply.status(201).send(graduate);
        } catch (error) {
          if (error instanceof DuplicateGraduateError) {
            return reply
              .status(409)
              .send({ error: "Conflict", message: "A graduate with this email already exists" });
          }
          throw error;
        }
      },
    );

    /** PATCH /admin/graduates/:id: edits names or email; 404 unknown, 409 email taken. */
    app.patch(
      "/admin/graduates/:id",
      {
        preHandler: requireAdmin,
        schema: {
          params: z.object({ id: z.string().uuid() }),
          body: updateGraduateRequestSchema,
          response: {
            200: graduateSchema,
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
        try {
          const graduate = await service.updateGraduate(request.params.id, request.body, request.adminHandle ?? "unknown");
          if (!graduate) return reply.status(404).send({ error: "Not Found", message: "Graduate not found" });
          return reply.status(200).send(graduate);
        } catch (error) {
          if (error instanceof DuplicateGraduateError) {
            return reply
              .status(409)
              .send({ error: "Conflict", message: "A graduate with this email already exists" });
          }
          throw error;
        }
      },
    );
  };
}
