import { z } from "zod";

/** Shape returned by every error response across the API. */
export const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** ISO 8601 timestamp with offset, e.g. what `Date.prototype.toISOString()` returns. */
export const timestampSchema = z.string().datetime({ offset: true });

/** Moderation state shared by photos and wishes: shown by default, hidden reversibly, or removed on takedown. */
export const moderationStatusSchema = z.enum(["visible", "hidden", "removed"]);
export type ModerationStatus = z.infer<typeof moderationStatusSchema>;

/** Body of the admin moderate endpoints (media and wishes). */
export const moderateRequestSchema = z.object({ status: moderationStatusSchema });
export type ModerateRequest = z.infer<typeof moderateRequestSchema>;

/** Cursor pagination for listings: newest first, `cursor` is opaque and comes from `nextCursor`. */
export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

/**
 * Next.js cache tags of the public listings the web app fetches (`next.tags`).
 * Admin moderation and public-flag writes answer with `revalidateTags` naming
 * the tags they made stale; the admin UI's Server Action calls `revalidateTag`
 * for each, so a takedown or a curated-gallery change shows without waiting
 * for the revalidate window. The API itself cannot reach the Vercel cache.
 */
export const CACHE_TAGS = {
  event: "event",
  /** GET /gallery */
  gallery: "gallery",
  /** GET /wishes */
  wishes: "wishes",
  /** GET /gallery/public (curated, #75) */
  publicGallery: "gallery-public",
  /** GET /wishes/public (curated, #75) */
  publicWishes: "wishes-public",
} as const;

export const cacheTagSchema = z.enum([
  CACHE_TAGS.event,
  CACHE_TAGS.gallery,
  CACHE_TAGS.wishes,
  CACHE_TAGS.publicGallery,
  CACHE_TAGS.publicWishes,
]);
export type CacheTag = z.infer<typeof cacheTagSchema>;

/** Query-string boolean: `true`/`false` (or `1`/`0`). `z.coerce.boolean()` would read "false" as true. */
export const queryBooleanSchema = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

/**
 * Body of the admin public-flag endpoints (#75), media and wishes. Only a
 * `visible` item can be made public; un-flagging always works.
 */
export const setPublicRequestSchema = z.object({ isPublic: z.boolean() });
export type SetPublicRequest = z.infer<typeof setPublicRequestSchema>;
