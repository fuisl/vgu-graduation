import {
  CACHE_TAGS,
  publicGalleryResponseSchema,
  publicWishesResponseSchema,
  type GalleryItem,
  type Wish,
} from "@grad/contract";
import { apiFetch } from "./client";
import { type ApiResult, errorResult, ok } from "./result";

/**
 * The curated, anonymous listings behind /memories and its timeline (#75, #76).
 * Only these two endpoints are called: they return items that are visible AND
 * flagged public by a moderator, so an unflagged photo or wish can never reach
 * these pages. Same cadence as GET /gallery and GET /wishes; the tags are the
 * ones admin moderation returns in `revalidateTags`, so a takedown shows at once.
 */

/** Pages of 100 followed per listing. The curated set is small; this bounds a render to 5 cached calls. */
export const PUBLIC_LISTING_MAX_PAGES = 5;
const PAGE_SIZE = 100;

export type PublicListing<T> = {
  items: T[];
  /** True when PUBLIC_LISTING_MAX_PAGES was reached and older items were left out. */
  truncated: boolean;
};

/** The bit of a zod page schema used here, so the web app needs no direct zod dependency. */
type PageSchema<T> = {
  safeParse(value: unknown): { success: true; data: { items: T[]; nextCursor: string | null } } | { success: false };
};

async function getPublicListing<T>(
  path: "/gallery/public" | "/wishes/public",
  schema: PageSchema<T>,
  seconds: number,
  tag: string,
): Promise<ApiResult<PublicListing<T>>> {
  const items: T[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < PUBLIC_LISTING_MAX_PAGES; page += 1) {
    const query = `limit=${PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    let response: Response;
    try {
      response = await apiFetch(`${path}?${query}`, { cache: { mode: "revalidate", seconds, tags: [tag] } });
    } catch {
      return errorResult("network", "Could not reach the API");
    }
    if (!response.ok) return errorResult("http", "The API returned an unexpected error", response.status);

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return errorResult("validation", "The API response was not valid JSON");
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return errorResult("validation", "The API response did not match the expected shape");

    items.push(...parsed.data.items);
    cursor = parsed.data.nextCursor;
    if (!cursor) return ok({ items, truncated: false });
  }
  return ok({ items, truncated: true });
}

/** GET /gallery/public: curated photos, newest first, on the 60-second gallery cadence. */
export function getPublicGallery(): Promise<ApiResult<PublicListing<GalleryItem>>> {
  return getPublicListing("/gallery/public", publicGalleryResponseSchema, 60, CACHE_TAGS.publicGallery);
}

/** GET /wishes/public: curated wishes, newest first, on the 30-second wishes cadence. */
export function getPublicWishes(): Promise<ApiResult<PublicListing<Wish>>> {
  return getPublicListing("/wishes/public", publicWishesResponseSchema, 30, CACHE_TAGS.publicWishes);
}
