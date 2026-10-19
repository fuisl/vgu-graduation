import { CACHE_TAGS, cacheTagSchema, type CacheTag } from "@grad/contract";

/**
 * Next.js cache tags of the BFF's public listings (`next.tags` in lib/api/*).
 * They are the contract's `CACHE_TAGS` verbatim, so a tag the API names in
 * `revalidateTags` is exactly the tag the web fetch was stored under. The
 * listings import these constants instead of repeating the strings.
 */
export const WEB_CACHE_TAGS = {
  event: CACHE_TAGS.event,
  /** lib/api/gallery.ts `getGallery` (GET /gallery) */
  gallery: CACHE_TAGS.gallery,
  /** GET /gallery/public (curated, #75) */
  publicGallery: CACHE_TAGS.publicGallery,
  /** lib/api/wishes.ts `getWishes` (GET /wishes) */
  wishes: CACHE_TAGS.wishes,
  /** GET /wishes/public (curated, #75) */
  publicWishes: CACHE_TAGS.publicWishes,
} as const satisfies Record<string, CacheTag>;

/** API tag → the web tags its data is cached under. One to one today; kept explicit so the two can diverge safely. */
const WEB_TAGS_FOR: Record<CacheTag, readonly string[]> = {
  [CACHE_TAGS.event]: [WEB_CACHE_TAGS.event],
  [CACHE_TAGS.gallery]: [WEB_CACHE_TAGS.gallery],
  [CACHE_TAGS.publicGallery]: [WEB_CACHE_TAGS.publicGallery],
  [CACHE_TAGS.wishes]: [WEB_CACHE_TAGS.wishes],
  [CACHE_TAGS.publicWishes]: [WEB_CACHE_TAGS.publicWishes],
};

/**
 * The web cache tags to pass to `revalidateTag` for an admin write's
 * `revalidateTags`. Unknown tags are dropped (never forwarded blindly) and
 * duplicates collapse, so each tag is revalidated once.
 */
export function webTagsToRevalidate(apiTags: readonly string[]): string[] {
  const tags = new Set<string>();
  for (const tag of apiTags) {
    const known = cacheTagSchema.safeParse(tag);
    if (!known.success) continue;
    for (const webTag of WEB_TAGS_FOR[known.data]) tags.add(webTag);
  }
  return [...tags];
}
