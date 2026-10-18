import type { GalleryItem, TranslationSegment, Wish } from "@grad/contract";
import { describe, expect, it } from "vitest";
import {
  DISPLAY_LIMITS,
  EMPTY_DISPLAY,
  applyDisplayMessage,
  applyFeedResponse,
  parseDisplayMessage,
  parseFeedResponse,
  pickNextSlide,
  recordShown,
  slideDurationMs,
  slidesOf,
  wishSize,
  type Slide,
} from "./display-feed";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 24, 9, minute)).toISOString();
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const wish = (n: number, body = `Wish ${n}`): Wish => ({ id: uuid(n), authorName: `Guest ${n}`, body, createdAt: at(n) });
const photo = (n: number): GalleryItem => ({ publicId: `p${n}`, width: 1600, height: 1200, createdAt: at(n) });
const segment = (sequence: number): TranslationSegment => ({
  sessionId: "s1",
  sequence,
  startMs: 0,
  endMs: 1,
  sourceLanguage: "en",
  sourceText: `Line ${sequence}`,
  translations: [],
});

describe("applyDisplayMessage", () => {
  it("upserts wishes and photos idempotently, newest first", () => {
    let s = applyDisplayMessage(EMPTY_DISPLAY, { type: "wish", wish: wish(1) });
    s = applyDisplayMessage(s, { type: "wish", wish: wish(2) });
    s = applyDisplayMessage(s, { type: "wish", wish: wish(1, "edited") });
    s = applyDisplayMessage(s, { type: "photo", photo: photo(3) });
    s = applyDisplayMessage(s, { type: "photo", photo: photo(3) });
    expect(s.wishes.map((w) => w.body)).toEqual(["Wish 2", "edited"]);
    expect(s.photos).toHaveLength(1);
  });

  it("takes hidden items off screen", () => {
    let s = applyDisplayMessage(EMPTY_DISPLAY, { type: "wish", wish: wish(1) });
    s = applyDisplayMessage(s, { type: "photo", photo: photo(2) });
    s = applyDisplayMessage(s, { type: "hidden", kind: "wish", id: uuid(1) });
    s = applyDisplayMessage(s, { type: "hidden", kind: "photo", id: "p2" });
    s = applyDisplayMessage(s, { type: "hidden", kind: "photo", id: "unknown" });
    expect(s.wishes).toEqual([]);
    expect(s.photos).toEqual([]);
  });

  it("keeps the newest items within the limits", () => {
    let s = EMPTY_DISPLAY;
    for (let i = 0; i < DISPLAY_LIMITS.wishes + 40; i += 1) s = applyDisplayMessage(s, { type: "wish", wish: wish(i) });
    for (let i = 0; i < 20; i += 1) s = applyDisplayMessage(s, { type: "segment", segment: segment(i) });
    expect(s.wishes).toHaveLength(DISPLAY_LIMITS.wishes);
    expect(s.wishes[0]!.id).toBe(uuid(DISPLAY_LIMITS.wishes + 39));
    expect(s.captions.map((c) => c.sequence)).toEqual([16, 17, 18, 19]);
  });

  it("tracks the latest until from keepalives and catch-up", () => {
    let s = applyDisplayMessage(EMPTY_DISPLAY, { type: "keepalive", until: at(5) });
    s = applyDisplayMessage(s, { type: "keepalive", until: at(3) });
    expect(s.until).toBe(at(5));
    s = applyFeedResponse(s, { messages: [{ type: "wish", wish: wish(1) }], until: at(9) });
    expect(s.until).toBe(at(9));
    expect(s.wishes).toHaveLength(1);
  });
});

describe("parsing", () => {
  it("accepts contract messages and drops anything else", () => {
    expect(parseDisplayMessage(JSON.stringify({ type: "keepalive", until: at(1) }))).toEqual({ type: "keepalive", until: at(1) });
    expect(parseDisplayMessage("not json")).toBeNull();
    expect(parseDisplayMessage(JSON.stringify({ type: "unknown" }))).toBeNull();
    expect(parseFeedResponse({ messages: [], until: at(1) })).toEqual({ messages: [], until: at(1) });
    expect(parseFeedResponse({ messages: "x" })).toBeNull();
  });
});

describe("pickNextSlide", () => {
  const slides = slidesOf({ wishes: [wish(4), wish(2)], photos: [photo(3), photo(1)] });
  const key = (s: Slide | null) => s?.key ?? null;

  it("is null with nothing to show and repeats a single slide", () => {
    expect(pickNextSlide([], null, new Map())).toBeNull();
    const one = slidesOf({ wishes: [wish(1)], photos: [] });
    expect(key(pickNextSlide(one, one[0]!.key, new Map()))).toBe(one[0]!.key);
  });

  it("shows the newest unseen first, then alternates kinds", () => {
    let shown = new Map<string, number>();
    let current: string | null = null;
    const order: string[] = [];
    for (let tick = 0; tick < 8; tick += 1) {
      const next: Slide = pickNextSlide(slides, current, shown)!;
      order.push(next.key);
      shown = recordShown(shown, next.key, tick, slides);
      current = next.key;
    }
    expect(order).toEqual([
      `wish:${uuid(4)}`, "photo:p3", `wish:${uuid(2)}`, "photo:p1",
      `wish:${uuid(4)}`, "photo:p3", `wish:${uuid(2)}`, "photo:p1",
    ]);
  });

  it("lets a new arrival jump the queue", () => {
    const shown = new Map(slides.map((s, i) => [s.key, i]));
    const withNew = slidesOf({ wishes: [wish(9), wish(4), wish(2)], photos: [photo(3), photo(1)] });
    expect(key(pickNextSlide(withNew, "photo:p1", shown))).toBe(`wish:${uuid(9)}`);
    // Fresh of the same kind beats a stale slide of the other kind.
    expect(key(pickNextSlide(withNew, `wish:${uuid(2)}`, shown))).toBe(`wish:${uuid(9)}`);
  });

  it("skips slides that failed to load", () => {
    expect(key(pickNextSlide(slides, `wish:${uuid(4)}`, new Map(), new Set(["photo:p3", "photo:p1"])))).toBe(`wish:${uuid(2)}`);
  });

  it("forgets keys no longer on the deck", () => {
    const shown = recordShown(new Map([["gone", 1]]), `wish:${uuid(4)}`, 2, slides);
    expect([...shown.keys()]).toEqual([`wish:${uuid(4)}`]);
  });
});

describe("timing and sizing", () => {
  it("gives longer wishes more time, within bounds", () => {
    const [w] = slidesOf({ wishes: [wish(1, "x".repeat(10))], photos: [] });
    const [long] = slidesOf({ wishes: [wish(1, "x".repeat(1_000))], photos: [] });
    const [p] = slidesOf({ wishes: [], photos: [photo(1)] });
    expect(slideDurationMs(w!)).toBe(8_000);
    expect(slideDurationMs(long!)).toBe(20_000);
    expect(slideDurationMs(p!)).toBe(9_000);
  });

  it("steps wish type down as the text grows", () => {
    expect(["a".repeat(50), "a".repeat(200), "a".repeat(400), "a".repeat(600), "a".repeat(1_000)].map(wishSize)).toEqual(["xl", "l", "m", "s", "xs"]);
  });
});
