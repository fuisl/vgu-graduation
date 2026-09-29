import { z } from "zod";
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

/** Server-to-client messages on `WS /live/display` (event kiosk): approved wishes, visible photos and translation. */
export const liveDisplayMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("wish"), wish: wishSchema }),
  z.object({ type: z.literal("photo"), photo: galleryItemSchema }),
  z.object({ type: z.literal("segment"), segment: translationSegmentSchema }),
  z.object({ type: z.literal("hidden"), kind: z.enum(["wish", "photo"]), id: z.string().min(1) }),
]);
export type LiveDisplayMessage = z.infer<typeof liveDisplayMessageSchema>;
