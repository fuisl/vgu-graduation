import {
  errorResponseSchema,
  ingestTranslationSegmentRequestSchema,
  ingestTranslationSegmentResponseSchema,
  liveTranslationSegmentsQuerySchema,
  liveTranslationSegmentsResponseSchema,
  targetLanguageSchema,
  type TranslationSegment,
} from "@grad/contract";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireService } from "../../auth/service-auth.js";
import type { Config } from "../../config.js";
import { IngestProxy, type IngestProxyOptions } from "./ingest.proxy.js";
import { TranslationFeed, type TranslationFeedOptions } from "./translation.feed.js";
import { TranslationRepository, type TranslationStore } from "./translation.repository.js";

export interface TranslationRoutesOptions {
  config: Pick<Config, "publicOrigin" | "serviceTokens" | "translation">;
  /** Override for tests; defaults to the database. */
  store?: TranslationStore;
  /** Timing and size overrides for tests. */
  feed?: TranslationFeedOptions;
  /** Timing overrides for tests. */
  ingest?: Pick<IngestProxyOptions, "reconnectMinMs" | "reconnectMaxMs" | "pingIntervalMs" | "maxUpstreamBufferedBytes">;
  /** Extra destination for every stored change (the event display). */
  onSegment?: (segment: TranslationSegment) => void;
}

const RETRY_AFTER_SECONDS = "5";

/**
 * Translation module (#68, experimental). Everything here is optional to the
 * rest of the API: with the translation service absent, segments simply stop,
 * ingest reports `unavailable`, listeners see `status: unavailable`, and no
 * other route is affected.
 *
 * - `POST /internal/translation/segments`: the translation service posts each
 *   segment (service token `translation`); stored, merged and broadcast.
 * - `WS /live/translation` and `GET /live/translation/segments`: captions for
 *   phones and the display. Public, like the ceremony itself: captions are what
 *   is said on stage, nothing per guest. Browsers must come from PUBLIC_ORIGIN.
 * - `WS /live/ingest`: venue audio from the capture client (service token
 *   `ingest`), relayed to the translation service (ADR-007).
 */
export const translationRoutes: FastifyPluginAsync<TranslationRoutesOptions> = async (fastify, options) => {
  const { config } = options;
  const store = options.store ?? new TranslationRepository();
  const feed = new TranslationFeed(
    store,
    fastify.log,
    { maxClients: config.translation.maxClients, ...options.feed },
    options.onSegment ? [options.onSegment] : [],
  );
  const proxy = new IngestProxy(fastify.log, {
    upstreamUrl: config.translation.ingestUrl,
    upstreamToken: config.serviceTokens.translation,
    onLiveChange: (live) => feed.setIngestLive(live),
    ...options.ingest,
  });

  // Memory loads lazily on the first listener or catch-up, so the API boots
  // and serves everything else whether or not these tables answer.
  fastify.addHook("onClose", async () => {
    proxy.close();
    feed.close();
  });

  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const tokens = config.serviceTokens;

  /** Browsers only from the public origin, so another site can't open sockets in a guest's name. */
  async function publicOrigin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== config.publicOrigin) {
      return reply.status(403).send({ error: "Forbidden", message: "Origin not allowed" });
    }
  }

  async function listenerCapacity(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await publicOrigin(request, reply);
    if (reply.sent) return;
    if (feed.full) {
      reply.header("Retry-After", RETRY_AFTER_SECONDS);
      return reply
        .status(503)
        .send({ error: "Service Unavailable", message: "Too many live caption connections; poll /live/translation/segments" });
    }
  }

  app.post(
    "/internal/translation/segments",
    {
      preValidation: requireService("translation", tokens),
      schema: {
        body: ingestTranslationSegmentRequestSchema,
        response: {
          200: ingestTranslationSegmentResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      let result;
      try {
        result = await store.upsert(request.body);
      } catch (err) {
        // The service retries; nothing of the segment's text goes to the log.
        request.log.error({ err: { name: (err as Error).name, code: (err as { code?: string }).code } }, "translation segment not stored");
        reply.header("Retry-After", RETRY_AFTER_SECONDS);
        return reply.status(503).send({ error: "Service Unavailable", message: "Segment not stored; retry" });
      }
      if (result.changed) feed.publish(result);
      return reply.status(200).send({ segment: result.segment, changed: result.changed });
    },
  );

  /**
   * WS /live/translation?lang=de|en|vi: server-to-client only. Sends status and
   * the recent segments first, then every change.
   */
  app.get(
    "/live/translation",
    {
      websocket: true,
      preValidation: listenerCapacity,
      schema: { querystring: z.object({ lang: targetLanguageSchema.optional() }) },
    },
    (socket, request) => {
      socket.on("message", () => {
        // Clients only listen; anything they send is ignored.
      });
      return feed.subscribe(socket, request.query.lang);
    },
  );

  /** GET /live/translation/segments: catch-up after a reconnect, and the polling fallback. */
  app.get(
    "/live/translation/segments",
    {
      preValidation: publicOrigin,
      schema: {
        querystring: liveTranslationSegmentsQuerySchema,
        response: {
          200: liveTranslationSegmentsResponseSchema,
          400: errorResponseSchema,
          403: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { since, lang, limit } = request.query;
      try {
        return reply.status(200).send(await feed.catchUp(since === undefined ? undefined : new Date(since), lang, limit));
      } catch (err) {
        request.log.error({ err }, "translation catch-up failed");
        reply.header("Retry-After", RETRY_AFTER_SECONDS);
        return reply.status(503).send({ error: "Service Unavailable", message: "Captions are unavailable; retry" });
      }
    },
  );

  /** WS /live/ingest: the venue capture client's audio, relayed to the translation service. */
  app.get("/live/ingest", { websocket: true, preValidation: requireService("ingest", tokens) }, (socket) => {
    proxy.attach(socket);
  });
};
