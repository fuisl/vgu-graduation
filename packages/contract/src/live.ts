import { z } from "zod";
import { timestampSchema } from "./common.js";
import { galleryItemSchema } from "./media.js";
import { translationSegmentSchema } from "./translation.js";
import { wishSchema } from "./wishes.js";

/**
 * Server-to-client messages on `WS /live/translation` (phones). Clients that
 * reconnect fetch the backlog over HTTP (`translationBacklogQuerySchema`) and
 * then continue from the live stream. `unavailable` is sent while the
 * translation service is absent, so the page can say so and nothing else breaks.
 */
export const liveTranslationMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("segment"), segment: translationSegmentSchema }),
  z.object({ type: z.literal("status"), state: z.enum(["live", "unavailable"]) }),
]);
export type LiveTranslationMessage = z.infer<typeof liveTranslationMessageSchema>;

/**
 * Server-to-client messages on `WS /live/display` (event kiosk): visible wishes,
 * visible processed photos and translation. `wish`/`photo` add or update an item
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
