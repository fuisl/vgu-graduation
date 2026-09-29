import { errorResponseSchema, eventSchema, updateEventRequestSchema } from "@grad/contract";
import type { EventConfig } from "@grad/contract";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { config as defaultConfig, type Config } from "../../config.js";
import { requireAdmin } from "../admin/admin-auth.js";
import { buildIcs } from "./event.ics.js";
import { EventRepository, type EventStore, type StoredEvent } from "./event.repository.js";

/** Event config changes rarely: CDN revalidates every 5 minutes (architecture §4.1). */
const PUBLIC_CACHE = "public, s-maxage=300, stale-while-revalidate=60";

/** Maps the stored row to the public contract document. */
export function toEventConfig(row: StoredEvent): EventConfig {
  return {
    name: row.name,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    timeZone: row.timeZone,
    timeConfirmed: row.timeConfirmed,
    venue: { name: row.venueName, address: row.venueAddress, mapUrl: row.venueMapUrl },
    contact: row.contactName
      ? { name: row.contactName, email: row.contactEmail, phone: row.contactPhone }
      : null,
    arrivalInfo: row.arrivalInfo,
  };
}

const notFound = { error: "Not Found", message: "Event is not configured" };

export function createEventRoutes(
  store: EventStore = new EventRepository(),
  config: Pick<Config, "publicOrigin"> = defaultConfig,
): FastifyPluginAsync {
  return async (fastify) => {
    const app = fastify.withTypeProvider<ZodTypeProvider>();
    const siteUrl = config.publicOrigin;
    const uidDomain = new URL(siteUrl).hostname;

    /** GET /event: public event configuration. */
    app.get(
      "/event",
      { schema: { response: { 200: eventSchema, 404: errorResponseSchema } } },
      async (_request, reply) => {
        const row = await store.get();
        if (!row) return reply.status(404).send(notFound);
        reply.header("Cache-Control", PUBLIC_CACHE);
        return reply.status(200).send(toEventConfig(row));
      },
    );

    /** GET /event/calendar.ics: public subscribable feed (webcal://), no personal data. */
    app.get("/event/calendar.ics", async (_request, reply) => {
      const row = await store.get();
      if (!row) return reply.status(404).send(notFound);
      return reply
        .header("Cache-Control", PUBLIC_CACHE)
        .type("text/calendar; charset=utf-8")
        .send(buildIcs(row, { uidDomain, siteUrl }));
    });

    /** PUT /admin/event: replaces the configuration and bumps the feed SEQUENCE. */
    app.put(
      "/admin/event",
      {
        preHandler: requireAdmin,
        schema: {
          body: updateEventRequestSchema,
          response: { 200: eventSchema, 401: errorResponseSchema, 404: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const row = await store.update(request.body, request.adminHandle as string);
        if (!row) return reply.status(404).send(notFound);
        reply.header("Cache-Control", "no-store");
        return reply.status(200).send(toEventConfig(row));
      },
    );
  };
}

export const eventRoutes: FastifyPluginAsync = createEventRoutes();
