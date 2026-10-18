import type { GalleryItem, LiveDisplayFeedResponse, LiveDisplayMessage, TranslationSegment, Wish } from "@grad/contract";
import { isLiveDisplayFeedResponse, isLiveDisplayMessage } from "./guards";
import { mergeSegment } from "./segments";

/** What the kiosk holds. Bounded, so hours of wishes and photos never grow memory or the DOM. */
export const DISPLAY_LIMITS = { wishes: 150, photos: 150, captions: 4 } as const;

export interface DisplayContent {
  /** Newest first, unique by id. */
  wishes: Wish[];
  /** Newest first, unique by publicId. */
  photos: GalleryItem[];
  /** Latest caption segments in spoken order (the display shows the last one). */
  captions: TranslationSegment[];
  /** Server time to pass as `since` on the next catch-up; null before the first. */
  until: string | null;
}

export const EMPTY_DISPLAY: DisplayContent = { wishes: [], photos: [], captions: [], until: null };

function newestFirst<T extends { createdAt: string }>(a: T, b: T): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

function upsert<T extends { createdAt: string }>(list: readonly T[], item: T, id: (t: T) => string, max: number): T[] {
  const key = id(item);
  const next = list.filter((t) => id(t) !== key);
  next.push(item);
  next.sort(newestFirst);
  return next.length > max ? next.slice(0, max) : next;
}

function later(a: string | null, b: string): string {
  if (a === null) return b;
  return Date.parse(b) >= Date.parse(a) ? b : a;
}

/**
 * Applies one feed message. Idempotent by id, because the catch-up fetch can
 * repeat what the socket already delivered (contract `liveDisplayMessageSchema`).
 */
export function applyDisplayMessage(state: DisplayContent, message: LiveDisplayMessage): DisplayContent {
  switch (message.type) {
    case "wish":
      return { ...state, wishes: upsert(state.wishes, message.wish, (w) => w.id, DISPLAY_LIMITS.wishes) };
    case "photo":
      return { ...state, photos: upsert(state.photos, message.photo, (p) => p.publicId, DISPLAY_LIMITS.photos) };
    case "hidden":
      return message.kind === "wish"
        ? { ...state, wishes: state.wishes.filter((w) => w.id !== message.id) }
        : { ...state, photos: state.photos.filter((p) => p.publicId !== message.id) };
    case "segment":
      return { ...state, captions: mergeSegment(state.captions, message.segment, DISPLAY_LIMITS.captions) };
    case "keepalive":
      return { ...state, until: later(state.until, message.until) };
  }
}

/** Applies a catch-up response: its messages, then its `until`. */
export function applyFeedResponse(state: DisplayContent, response: LiveDisplayFeedResponse): DisplayContent {
  let next = state;
  for (const message of response.messages) next = applyDisplayMessage(next, message);
  return { ...next, until: later(next.until, response.until) };
}

/** Parses one socket frame; anything malformed or unknown is dropped, never thrown. */
export function parseDisplayMessage(data: string): LiveDisplayMessage | null {
  try {
    const message: unknown = JSON.parse(data);
    return isLiveDisplayMessage(message) ? message : null;
  } catch {
    return null;
  }
}

export function parseFeedResponse(body: unknown): LiveDisplayFeedResponse | null {
  return isLiveDisplayFeedResponse(body) ? body : null;
}

export type Slide =
  | { kind: "wish"; key: string; wish: Wish }
  | { kind: "photo"; key: string; photo: GalleryItem };

export function slidesOf(content: Pick<DisplayContent, "wishes" | "photos">): Slide[] {
  return [
    ...content.wishes.map((wish): Slide => ({ kind: "wish", key: `wish:${wish.id}`, wish })),
    ...content.photos.map((photo): Slide => ({ kind: "photo", key: `photo:${photo.publicId}`, photo })),
  ];
}

function createdAt(slide: Slide): number {
  return Date.parse(slide.kind === "wish" ? slide.wish.createdAt : slide.photo.createdAt);
}

/** Never shown first (newest first), then the least recently shown. */
function better(a: Slide, b: Slide, shown: ReadonlyMap<string, number>): boolean {
  const sa = shown.get(a.key);
  const sb = shown.get(b.key);
  if ((sa === undefined) !== (sb === undefined)) return sa === undefined;
  if (sa !== undefined && sb !== undefined && sa !== sb) return sa < sb;
  return createdAt(a) > createdAt(b);
}

/**
 * Chooses the next slide. New arrivals jump the queue, then everything cycles
 * least-recently-shown first, alternating wishes and photos when both exist
 * (unless only the current kind has something new). `shown` maps a slide key
 * to the tick it was last on screen; `skip` holds keys that failed to load.
 */
export function pickNextSlide(
  slides: readonly Slide[],
  currentKey: string | null,
  shown: ReadonlyMap<string, number>,
  skip: ReadonlySet<string> = new Set(),
): Slide | null {
  const usable = slides.filter((s) => !skip.has(s.key));
  if (usable.length === 0) return null;
  const others = usable.filter((s) => s.key !== currentKey);
  if (others.length === 0) return usable[0]!;
  const currentKind = usable.find((s) => s.key === currentKey)?.kind ?? null;
  let bestSame: Slide | null = null;
  let bestOther: Slide | null = null;
  for (const s of others) {
    if (s.kind === currentKind) {
      if (!bestSame || better(s, bestSame, shown)) bestSame = s;
    } else if (!bestOther || better(s, bestOther, shown)) {
      bestOther = s;
    }
  }
  if (!bestOther) return bestSame;
  if (!bestSame) return bestOther;
  const fresh = (s: Slide) => !shown.has(s.key);
  return fresh(bestSame) && !fresh(bestOther) ? bestSame : bestOther;
}

/** Records a slide as shown and forgets keys that are no longer on the deck, so the map stays bounded. */
export function recordShown(
  shown: ReadonlyMap<string, number>,
  key: string,
  tick: number,
  slides: readonly Slide[],
): Map<string, number> {
  const live = new Set(slides.map((s) => s.key));
  const next = new Map<string, number>();
  for (const [k, v] of shown) if (live.has(k)) next.set(k, v);
  next.set(key, tick);
  return next;
}

/** How long a slide stays up: photos a fixed beat, wishes long enough to read from the back of a hall. */
export function slideDurationMs(slide: Slide): number {
  if (slide.kind === "photo") return 9_000;
  return Math.min(20_000, Math.max(8_000, 6_000 + slide.wish.body.length * 50));
}

/** Size class for a wish: shorter wishes get bigger type. */
export function wishSize(body: string): "xl" | "l" | "m" | "s" | "xs" {
  const n = body.length;
  if (n <= 90) return "xl";
  if (n <= 220) return "l";
  if (n <= 420) return "m";
  if (n <= 700) return "s";
  return "xs";
}
