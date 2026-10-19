import {
  errorResponseSchema,
  liveDisplayFeedQuerySchema,
  liveDisplayFeedResponseSchema,
  liveGalleryFeedQuerySchema,
  liveGalleryFeedResponseSchema,
  type LiveDisplayMessage,
  type LiveGalleryMessage,
} from "@grad/contract";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { invitationToken } from "../../auth/credentials.js";
import type { Config } from "../../config.js";
import { type ChangeNotifier, LIVE_CHANNEL, PgListener } from "../../db/notify.js";
import { InvitationsService } from "../invitations/invitations.service.js";
import { translationRoutes, type TranslationRoutesOptions } from "../translation/translation.routes.js";
import { DisplayFeed, type DisplayFeedOptions } from "./display.feed.js";
import { DisplayRepository, type DisplaySource } from "./display.repository.js";
import { LiveHub } from "./live.hub.js";

export interface LiveRoutesOptions {
  config: Pick<Config, "publicOrigin" | "serviceTokens" | "translation"> &
    Partial<Pick<Config, "databaseUrl" | "live">>;
  /** Override for tests; defaults to the database-backed service. */
  invitationsService?: Pick<InvitationsService, "resolveByToken">;
  /** Override for tests; defaults to reading the database. */
  displaySource?: DisplaySource;
  /**
   * Wake-up hints for the feed (ADR-014). Defaults to a Postgres LISTEN on
   * `grad_live` when the source is the database; with a test source, none (the
   * feed's timer alone). `null` turns it off.
   */
  changes?: ChangeNotifier | null;
  /** Timing overrides for tests. */
  feed?: DisplayFeedOptions & { pingIntervalMs?: number };
  /** Overrides for the translation module (#68): its store and timings. */
  translation?: Omit<TranslationRoutesOptions, "config" | "onSegment">;
}

/** Seconds a refused or failed gallery client waits before polling or retrying. */
const GALLERY_RETRY_AFTER_SECONDS = "5";

/**
 * Live module (#65, ADR-014): `WS /live/display` and `WS /live/gallery` with
 * their HTTP catch-ups, plus the translation module's caption and ingest
 * routes (#68), registered here so captions reach the display hub.
 *
 * One feed serves both sockets: it polls while either has a listener, and a
 * Postgres NOTIFY raised by the wish and photo triggers makes it poll at once.
 *
 * Auth, `/live/display`: the kiosk keeps the invitation credential (#65), like
 * every guest route. It is given its own invitation, opens its link once so the
 * `inv` cookie is set on the parent domain, and the browser then sends that
 * cookie on the WebSocket handshake; tokens never go in the URL.
 *
 * Auth, `/live/gallery`: public, exactly like `GET /gallery` and `GET /wishes`
 * (decided 2026-09-30), and it carries nothing those don't list: visible
 * wishes, visible processed photos, and the bare ids of items taken away.
 *
 * Browsers must come from PUBLIC_ORIGIN on both, so another site can't ride a
 * guest's cookie into the socket or embed the feed.
 */
export const liveRoutes: FastifyPluginAsync<LiveRoutesOptions> = async (fastify, options) => {
  const invitations = options.invitationsService ?? new InvitationsService();
  const source = options.displaySource ?? new DisplayRepository();
  const databaseUrl = options.config.databaseUrl;
  const changes =
    options.changes !== undefined
      ? options.changes
      : options.displaySource || !databaseUrl
        ? null
        : new PgListener({ connectionString: databaseUrl, channel: LIVE_CHANNEL, log: fastify.log });
  const galleryMaxClients = options.config.live?.galleryMaxClients ?? 1000;

  // The feed runs while any hub has a listener and stops, closing the LISTEN
  // connection too, when the last one leaves.
  const active = new Set<"display" | "gallery">();
  let feed: DisplayFeed | undefined = undefined;
  const activate = (name: "display" | "gallery") => {
    active.add(name);
    if (active.size !== 1) return;
    feed?.start();
    changes?.start({ onNotify: () => feed?.nudge(), onReconnect: () => feed?.nudge() });
  };
  const deactivate = (name: "display" | "gallery") => {
    if (!active.delete(name) || active.size > 0) return;
    feed?.stop();
    void changes?.stop();
  };

  const hub = new LiveHub<LiveDisplayMessage>({
    pingIntervalMs: options.feed?.pingIntervalMs,
    onActive: () => activate("display"),
    onIdle: () => deactivate("display"),
  });
  const galleryHub = new LiveHub<LiveGalleryMessage>({
    pingIntervalMs: options.feed?.pingIntervalMs,
    onActive: () => activate("gallery"),
    onIdle: () => deactivate("gallery"),
  });
  feed = new DisplayFeed(
    source,
    {
      broadcast: (message) => {
        hub.broadcast(message);
        galleryHub.broadcast(message);
      },
    },
    fastify.log,
    options.feed,
  );
  const displayFeed = feed;

  fastify.addHook("onClose", async () => {
    displayFeed.stop();
    hub.close();
    galleryHub.close();
    await changes?.stop();
  });

  // Translation (#68) lives in its own module; the display also shows its captions.
  await fastify.register(translationRoutes, {
    config: options.config,
    ...options.translation,
    onSegment: (segment) => hub.broadcast({ type: "segment", segment }),
  });

  /** Browsers only from the public origin. Replies 403 otherwise. */
  async function publicOrigin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== options.config.publicOrigin) {
      return reply.status(403).send({ error: "Forbidden", message: "Origin not allowed" });
    }
  }

  /** The public origin, and room for one more gallery listener; past the cap, clients poll the catch-up. */
  async function galleryCapacity(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await publicOrigin(request, reply);
    if (reply.sent) return;
    if (galleryHub.size >= galleryMaxClients) {
      reply.header("Retry-After", GALLERY_RETRY_AFTER_SECONDS);
      return reply
        .status(503)
        .send({ error: "Service Unavailable", message: "Too many live gallery connections; poll /live/gallery/feed" });
    }
  }

  /** Invitation credential and, for browsers, the public origin. Replies with the error when refused. */
  async function authorize(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await publicOrigin(request, reply);
    if (reply.sent) return;
    const token = invitationToken(request);
    if (!token) {
      return reply
        .status(401)
        .send({ error: "Unauthorized", message: "Missing invitation bearer token or session cookie" });
    }
    const result = await invitations.resolveByToken(token);
    if (result.status === "expired") {
      return reply.status(410).send({ error: "Gone", message: "This invitation has expired" });
    }
    if (result.status === "invalid") {
      return reply.status(404).send({ error: "Not Found", message: "Invalid or revoked invitation" });
    }
  }

  const app = fastify.withTypeProvider<ZodTypeProvider>();

  /**
   * WS /live/display: server-to-client only. Open it first, then call the
   * catch-up endpoint, and apply both idempotently by id.
   */
  app.get("/live/display", { websocket: true, preValidation: authorize }, (socket) => {
    socket.on("message", () => {
      // Clients only listen; anything they send is ignored.
    });
    hub.add(socket);
  });

  /** GET /live/display/feed: catch-up after (re)connecting. Per-guest data, never cached. */
  app.get(
    "/live/display/feed",
    {
      preValidation: authorize,
      schema: {
        querystring: liveDisplayFeedQuerySchema,
        response: {
          200: liveDisplayFeedResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          410: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "private, no-store");
      const since = request.query.since === undefined ? undefined : new Date(request.query.since);
      return reply.status(200).send(await displayFeed.catchUp(since));
    },
  );

  /**
   * WS /live/gallery: server-to-client only, public. Open it first, then call
   * the catch-up endpoint, and apply both idempotently by id.
   */
  app.get("/live/gallery", { websocket: true, preValidation: galleryCapacity }, (socket) => {
    socket.on("message", () => {
      // Clients only listen; anything they send is ignored.
    });
    galleryHub.add(socket);
  });

  /**
   * GET /live/gallery/feed: catch-up after (re)connecting, and the polling
   * fallback when the socket can't open. Public like the listings it mirrors,
   * but never cached: it is the "what changed since" read.
   */
  app.get(
    "/live/gallery/feed",
    {
      preValidation: publicOrigin,
      schema: {
        querystring: liveGalleryFeedQuerySchema,
        response: {
          200: liveGalleryFeedResponseSchema,
          400: errorResponseSchema,
          403: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const since = request.query.since === undefined ? undefined : new Date(request.query.since);
      try {
        return reply.status(200).send(await displayFeed.catchUp(since));
      } catch (err) {
        request.log.error({ err: { name: (err as Error).name, code: (err as { code?: string }).code } }, "gallery catch-up failed");
        reply.header("Retry-After", GALLERY_RETRY_AFTER_SECONDS);
        return reply.status(503).send({ error: "Service Unavailable", message: "The live gallery is unavailable; retry" });
      }
    },
  );
};
