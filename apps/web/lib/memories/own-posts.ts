/**
 * What this guest just posted, kept for a few minutes so their own wish or
 * photo shows in the gallery at once (ADR-014), before the live feed has it:
 * a photo is still being processed for a second or two, and the gallery's
 * first paint can be a few seconds old.
 *
 * Per tab (`sessionStorage`), gone when the tab closes, and only what the
 * guest themselves posted and the public gallery shows anyway (the wish as the
 * API returned it, the photo's public id and a small preview): never a token
 * or anything from the invitation (ADR-011). Every access is wrapped in
 * try/catch; with storage blocked the gallery simply waits for the feed.
 */
import type { GalleryItem } from "../../data/gallery";

export type OwnPost =
  | { kind: "wish"; id: string; authorName: string; body: string; createdAt: string; savedAt: number }
  | {
      kind: "photo";
      publicId: string;
      /** A small JPEG data URL of the shot, shown until the processed photo arrives; null if none could be made. */
      preview: string | null;
      createdAt: string;
      savedAt: number;
    };

const KEY = "grad26.own-posts";
/** Long enough for any processing backlog on the day; after that the feed is the only source. */
export const OWN_POST_TTL_MS = 10 * 60_000;
const MAX_POSTS = 12;

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function isOwnPost(v: unknown): v is OwnPost {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  if (typeof p.createdAt !== "string" || typeof p.savedAt !== "number") return false;
  if (p.kind === "wish") return typeof p.id === "string" && typeof p.authorName === "string" && typeof p.body === "string";
  if (p.kind === "photo") return typeof p.publicId === "string" && (p.preview === null || typeof p.preview === "string");
  return false;
}

/** The unexpired posts, newest first. */
export function readOwnPosts(now: number = Date.now(), store: Storage | null = storage()): OwnPost[] {
  if (!store) return [];
  try {
    const raw: unknown = JSON.parse(store.getItem(KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(isOwnPost).filter((p) => now - p.savedAt < OWN_POST_TTL_MS);
  } catch {
    return [];
  }
}

function write(posts: OwnPost[], store: Storage | null): void {
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify(posts.slice(0, MAX_POSTS)));
  } catch {
    // Quota or blocked storage: the gallery falls back to the feed alone.
  }
}

const keyOf = (p: OwnPost) => (p.kind === "wish" ? `wish:${p.id}` : `photo:${p.publicId}`);

/** Fired on `window` when a post is remembered, so a gallery already on screen picks it up. */
export const OWN_POSTS_EVENT = "grad26:own-posts";

export function rememberOwnPost(post: OwnPost, store: Storage | null = storage()): void {
  const others = readOwnPosts(post.savedAt, store).filter((p) => keyOf(p) !== keyOf(post));
  write([post, ...others], store);
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(OWN_POSTS_EVENT));
  } catch {
    // No window events (tests, old browsers): the next render reads storage anyway.
  }
}

/** Drops posts the feed now carries (or that were taken down), by `wish:<id>` / `photo:<publicId>` key. */
export function forgetOwnPosts(keys: Iterable<string>, now: number = Date.now(), store: Storage | null = storage()): void {
  const drop = new Set(keys);
  if (drop.size === 0) return;
  const posts = readOwnPosts(now, store);
  const kept = posts.filter((p) => !drop.has(keyOf(p)));
  if (kept.length !== posts.length) write(kept, store);
}

export function ownPostKey(post: OwnPost): string {
  return keyOf(post);
}

/**
 * Adds the guest's own posts the gallery doesn't list yet, newest first.
 * - A photo shows with its local preview and `pending: "developing"` until the
 *   processed photo arrives from the feed.
 * - A wish is visible the moment it is posted, so it is only bridged until the
 *   feed's first snapshot (`synced`); after that the feed decides, and a wish a
 *   moderator hid is never brought back from here.
 * Returns the merged items and the keys the feed now carries, to forget.
 */
export function mergeOwnPosts(
  items: readonly GalleryItem[],
  own: readonly OwnPost[],
  synced: boolean,
): { items: GalleryItem[]; seen: string[] } {
  const listed = new Set(items.map((item) => item.id));
  const seen: string[] = [];
  const extra: GalleryItem[] = [];
  for (const post of own) {
    if (post.kind === "wish") {
      if (listed.has(`wish-${post.id}`)) seen.push(keyOf(post));
      else if (!synced)
        extra.push({ id: `wish-${post.id}`, type: "WISH", sender: post.authorName, audience: "class", content: post.body, timestamp: post.createdAt });
    } else if (listed.has(`photo-${post.publicId}`)) {
      seen.push(keyOf(post));
    } else if (post.preview) {
      extra.push({
        id: `photo-${post.publicId}`,
        type: "POLAROID",
        sender: null,
        audience: "everyone",
        content: post.preview,
        timestamp: post.createdAt,
        pending: "developing",
      });
    }
  }
  if (extra.length === 0) return { items: [...items], seen };
  const merged = [...extra, ...items].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  return { items: merged, seen };
}

/**
 * A small JPEG preview of a just-uploaded shot (about 20 to 40 kB as a data URL),
 * or null where the browser can't make one. Never throws.
 */
export async function previewDataUrl(blob: Blob, maxEdge = 480): Promise<string | null> {
  try {
    if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}
