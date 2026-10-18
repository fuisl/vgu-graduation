import { z } from "zod";
import { timestampSchema } from "./common.js";
import { galleryItemSchema } from "./media.js";
import { translationSegmentSchema, translationStateSchema } from "./translation.js";
import { wishSchema } from "./wishes.js";

/**
 * Server-to-client messages on `WS /live/translation` (phones and the display).
 * Connect with `?lang=de|en|vi` to receive only that caption language (omit it
 * for all). On connect the server sends `status`, then the recent segments as
 * `segment` messages, then live updates. A segment is re-sent whenever a
 * translation is added or a draft becomes final: apply segments idempotently by
 * (sessionId, sequence), and per language never replace a `final` with a draft.
 * `unavailable` is sent while the translation service is absent or suspended,
 * so the page can say so and nothing else breaks. `keepalive` arrives every
 * ~25 s: a client that hears nothing for longer should reconnect. After a
 * reconnect, pass the last `until` seen as `since` to
 * `GET /live/translation/segments` (`liveTranslationSegmentsQuerySchema`) to
 * fetch what was missed. `until` is optional only for compatibility; the server
 * sets it once it has read the database.
 */
export const liveTranslationMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("segment"), segment: translationSegmentSchema, until: timestampSchema.optional() }),
  z.object({ type: z.literal("status"), state: translationStateSchema, until: timestampSchema.optional() }),
  z.object({ type: z.literal("keepalive"), until: timestampSchema.optional() }),
]);
export type LiveTranslationMessage = z.infer<typeof liveTranslationMessageSchema>;

/**
 * Server-to-client messages on `WS /live/display` (event kiosk): visible wishes,
 * visible processed photos and translation captions. `segment` carries every
 * caption language, with the same semantics as on `WS /live/translation`;
 * captions are live only (the catch-up endpoint doesn't replay them, use
 * `GET /live/translation/segments`). `wish`/`photo` add or update an item
 * and `hidden` takes one off screen (a photo's `id` is its `publicId`); apply
 * them idempotently by id, since catch-up can repeat what the socket already sent.
 * `keepalive` arrives every ~25 s: a kiosk that hears nothing for longer should
 * reconnect, and `until` is what to pass as `since` to the catch-up endpoint
 * after a reconnect.
 */
export const liveDisplayMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("wish"), wish: wishSchema }),
  z.object({ type: z.literal("photo"), photo: galleryItemSchema }),
  z.object({ type: z.literal("segment"), segment: translationSegmentSchema }),
  z.object({ type: z.literal("hidden"), kind: z.enum(["wish", "photo"]), id: z.string().min(1) }),
  z.object({ type: z.literal("keepalive"), until: timestampSchema }),
]);
export type LiveDisplayMessage = z.infer<typeof liveDisplayMessageSchema>;

/**
 * GET /live/display/feed: catch-up for the display. Without `since`, the current
 * state (newest visible wishes and photos). With `since` (a previous `until`),
 * every wish and photo that changed after it, as `wish`/`photo`/`hidden`.
 * Clients open the socket first, then fetch this, so nothing falls in between.
 */
export const liveDisplayFeedQuerySchema = z.object({ since: timestampSchema.optional() });
export type LiveDisplayFeedQuery = z.infer<typeof liveDisplayFeedQuerySchema>;

export const liveDisplayFeedResponseSchema = z.object({
  messages: z.array(liveDisplayMessageSchema),
  /** Server time the response is complete up to; pass it back as `since`. */
  until: timestampSchema,
});
export type LiveDisplayFeedResponse = z.infer<typeof liveDisplayFeedResponseSchema>;
