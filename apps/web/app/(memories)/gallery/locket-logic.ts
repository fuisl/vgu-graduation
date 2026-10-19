import type { GalleryItem } from "../../../data/gallery";

/**
 * Pure rules behind the locket, kept out of the components so they are unit-tested
 * (`locket-logic.test.ts`).
 */

/** getUserMedia's error, as the three situations a guest can act on. */
export function cameraProblem(error: unknown): "denied" | "none" | "busy" {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "none";
  // NotReadableError (another app has it), AbortError and anything unknown: try again.
  return "busy";
}

/** What the feed has already shown: ids, and the newest timestamp among them. */
export type FeedSeen = { ids: Set<string>; newest: number };

export function newestOf(items: readonly GalleryItem[]): number {
  return items.reduce((newest, item) => Math.max(newest, Date.parse(item.timestamp) || 0), 0);
}

export function seenFrom(items: readonly GalleryItem[]): FeedSeen {
  return { ids: new Set(items.map((item) => item.id)), newest: newestOf(items) };
}

/**
 * New arrivals in `items` since `seen` (which it updates), and which of them to hold back
 * behind the "N new" button. Only genuinely newer items count (a catch-up snapshot that brings
 * older items is not "new"), and nothing is held unless the guest is reading further down the
 * feed. The guest's own developing photo is never held.
 */
export function arrivals(items: readonly GalleryItem[], seen: FeedSeen, reading: boolean): { fresh: GalleryItem[]; hold: string[] } {
  const fresh = items.filter((item) => !seen.ids.has(item.id) && (Date.parse(item.timestamp) || 0) >= seen.newest);
  for (const item of items) seen.ids.add(item.id);
  seen.newest = Math.max(seen.newest, newestOf(items));
  return { fresh, hold: reading ? fresh.filter((item) => !item.pending).map((item) => item.id) : [] };
}
