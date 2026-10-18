import { z } from "zod";
import { timestampSchema } from "./common.js";

/** Spoken languages the ceremony pipeline accepts (experimental, #18). */
export const sourceLanguageSchema = z.enum(["en", "vi"]);
export type SourceLanguage = z.infer<typeof sourceLanguageSchema>;

/** Languages captions can be shown in. */
export const targetLanguageSchema = z.enum(["de", "en", "vi"]);
export type TargetLanguage = z.infer<typeof targetLanguageSchema>;

/**
 * One translation of a segment. `draft` is fast and replaceable by a later
 * `final` for the same language; `failed` renders as "translation unavailable"
 * and never blocks other languages. `provider` names the backend (local GPU or
 * cloud) so providers stay swappable.
 */
export const translationTextSchema = z
  .object({
    language: targetLanguageSchema,
    status: z.enum(["draft", "final", "failed"]),
    text: z.string().nullable(),
    provider: z.string().nullable(),
  })
  .refine((t) => t.status === "failed" || t.text !== null, {
    message: "text is required unless status is failed",
    path: ["text"],
  });
export type TranslationText = z.infer<typeof translationTextSchema>;

/** A finalized source sentence with whatever translations exist so far. `sequence` is gapless per session. */
export const translationSegmentSchema = z
  .object({
    sessionId: z.string().min(1),
    sequence: z.number().int().min(0),
    startMs: z.number().int().min(0),
    endMs: z.number().int().min(0),
    sourceLanguage: sourceLanguageSchema,
    sourceText: z.string().min(1),
    translations: z.array(translationTextSchema),
  })
  .refine((s) => s.endMs >= s.startMs, { message: "endMs must not precede startMs", path: ["endMs"] });
export type TranslationSegment = z.infer<typeof translationSegmentSchema>;

/**
 * POST /internal/translation/segments (service token `translation`). Idempotent
 * per (sessionId, sequence, language): re-posting upgrades a draft to final and
 * lets later translations attach to an already-stored segment.
 */
export const ingestTranslationSegmentRequestSchema = translationSegmentSchema;
export type IngestTranslationSegmentRequest = z.infer<typeof ingestTranslationSegmentRequestSchema>;

/**
 * Sequence-based backlog within one session. Superseded by the timestamp-based
 * `liveTranslationSegmentsQuerySchema`, which is what `GET /live/translation/segments`
 * accepts; kept for compatibility.
 */
export const translationBacklogQuerySchema = z.object({
  sessionId: z.string().min(1),
  after: z.coerce.number().int().min(-1).default(-1),
});
export type TranslationBacklogQuery = z.infer<typeof translationBacklogQuerySchema>;

export const translationBacklogResponseSchema = z.object({
  segments: z.array(translationSegmentSchema),
});
export type TranslationBacklogResponse = z.infer<typeof translationBacklogResponseSchema>;

/**
 * Response of POST /internal/translation/segments: the segment as stored after
 * the merge (every language known so far), and whether anything changed. An
 * unchanged re-post (a retry, or a draft arriving after its final) is not
 * broadcast again.
 */
export const ingestTranslationSegmentResponseSchema = z.object({
  segment: translationSegmentSchema,
  changed: z.boolean(),
});
export type IngestTranslationSegmentResponse = z.infer<typeof ingestTranslationSegmentResponseSchema>;

/** Whether captions are flowing: `unavailable` means the page says "translation unavailable". */
export const translationStateSchema = z.enum(["live", "unavailable"]);
export type TranslationState = z.infer<typeof translationStateSchema>;

/**
 * GET /live/translation/segments: catch-up for phones and the display, and a
 * polling fallback where WebSockets don't get through. Without `since`, the
 * newest `limit` segments. With `since` (an `until` from a previous response or
 * socket message), every segment stored or re-translated after it. `lang` keeps
 * only that caption language in `translations` (the source text is always
 * included). Apply results idempotently by (sessionId, sequence); per language,
 * a `final` is never replaced by a draft.
 */
export const liveTranslationSegmentsQuerySchema = z.object({
  since: timestampSchema.optional(),
  lang: targetLanguageSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type LiveTranslationSegmentsQuery = z.infer<typeof liveTranslationSegmentsQuerySchema>;

export const liveTranslationSegmentsResponseSchema = z.object({
  /** Oldest change first. */
  segments: z.array(translationSegmentSchema),
  /** Server time the response is complete up to; pass it back as `since`. */
  until: timestampSchema,
  /** True when `limit` cut the response short: call again with `since: until`. */
  more: z.boolean(),
  state: translationStateSchema,
});
export type LiveTranslationSegmentsResponse = z.infer<typeof liveTranslationSegmentsResponseSchema>;

/*
 * WS /live/ingest: venue audio (ADR-007). Its binary part has no schema.
 *
 * Capture client -> API
 *   - Handshake header `Authorization: Bearer <SERVICE_TOKEN_INGEST>` (its own
 *     token, not the translation service's). Never a token in the URL.
 *   - Binary frames: raw PCM, 16 kHz, mono, signed 16-bit little-endian
 *     (s16le), no header or container. Send 20-200 ms per frame (640-6400
 *     bytes); a frame must be a whole number of samples (even length) and at
 *     most `INGEST_MAX_FRAME_BYTES`, or it is dropped. Frames are relayed
 *     verbatim and in order.
 *   - Text frames: optional JSON control messages (`ingestControlMessageSchema`),
 *     at most 4 KiB, relayed verbatim. Any JSON object with a string `type` is
 *     relayed, so the two ends can add messages without an API change; anything
 *     else is ignored. The API remembers the last valid `start` and replays it
 *     to the translation service after every upstream (re)connect, before any audio.
 *
 * API -> capture client
 *   - `ingestStatusMessageSchema` on connect and whenever the upstream changes.
 *     While `upstream` is `unavailable` audio is dropped, not queued (stale live
 *     audio is worthless): keep streaming, the API reconnects to the translation
 *     service by itself with backoff.
 *   - JSON text the translation service sends is relayed; ignore unknown types.
 *   - WebSocket pings every 15 s; a client that misses a pong is dropped.
 *   - Close 4001: another capture client took over (newest connection wins).
 *     Don't reconnect automatically on 4001, or two laptops take turns.
 *     Close 1001: the API is restarting; reconnect with backoff.
 *
 * API -> translation service (`TRANSLATION_INGEST_URL`, cluster network only)
 *   - One upstream socket while a capture client is connected, opened with
 *     `Authorization: Bearer <SERVICE_TOKEN_TRANSLATION>` so the service can
 *     check the caller is the API. Same binary and text frames as above. If the
 *     service sees no `start`, it assumes `INGEST_AUDIO_FORMAT` and detects the
 *     language itself.
 *   - The service posts segments back to POST /internal/translation/segments
 *     with the same token.
 */

/** Largest binary audio frame accepted on `WS /live/ingest` (512 ms of 16 kHz s16le mono). */
export const INGEST_MAX_FRAME_BYTES = 16 * 1024;

/** Audio format on `WS /live/ingest`. Fixed: the API does not resample. */
export const INGEST_AUDIO_FORMAT = { sampleRate: 16_000, channels: 1, encoding: "s16le" } as const;

/**
 * Control messages from the capture client (text frames). `start` describes the
 * stream; every field is optional and defaults to `INGEST_AUDIO_FORMAT` and
 * automatic language detection. `stop` marks a deliberate end (the speaker is
 * done), so the service can flush its last segment.
 */
export const ingestControlMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("start"),
    sessionId: z.string().min(1).max(100).optional(),
    sourceLanguage: sourceLanguageSchema.optional(),
    sampleRate: z.literal(16_000).optional(),
    channels: z.literal(1).optional(),
    encoding: z.literal("s16le").optional(),
  }),
  z.object({ type: z.literal("stop") }),
]);
export type IngestControlMessage = z.infer<typeof ingestControlMessageSchema>;

/** API -> capture client: whether the translation service is receiving the audio. */
export const ingestStatusMessageSchema = z.object({
  type: z.literal("status"),
  upstream: z.enum(["connected", "unavailable"]),
  /** Audio frames dropped since this capture client connected (upstream down or backed up, or malformed). */
  droppedFrames: z.number().int().min(0),
});
export type IngestStatusMessage = z.infer<typeof ingestStatusMessageSchema>;
