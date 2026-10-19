import { liveGalleryFeedResponseSchema, liveGalleryMessageSchema, type LiveGalleryFeedResponse } from "@grad/contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_LIVE_GALLERY,
  LiveGallery,
  applyGalleryFeed,
  applyGalleryMessage,
  parseGalleryMessage,
  type LiveGalleryLink,
} from "./gallery-feed";
import { isLiveGalleryFeedResponse, isLiveGalleryMessage } from "./guards";
import type { SocketLike } from "./live-socket";

const at = (s: number) => new Date(Date.UTC(2026, 10, 15, 3, 0, s)).toISOString();
const wish = (n: number, s = n) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, authorName: "Linh", body: `w${n}`, createdAt: at(s) });
const photo = (id: string, s: number) => ({ publicId: id, width: 640, height: 640, createdAt: at(s) });

describe("gallery feed state", () => {
  it("adds, updates and takes away items idempotently, newest first", () => {
    let state = applyGalleryMessage(EMPTY_LIVE_GALLERY, { type: "wish", wish: wish(1) });
    state = applyGalleryMessage(state, { type: "wish", wish: wish(2) });
    state = applyGalleryMessage(state, { type: "wish", wish: wish(1) });
    state = applyGalleryMessage(state, { type: "photo", photo: photo("p1", 3) });
    expect(state.wishes.map((w) => w.body)).toEqual(["w2", "w1"]);
    state = applyGalleryMessage(state, { type: "hidden", kind: "photo", id: "p1" });
    state = applyGalleryMessage(state, { type: "hidden", kind: "wish", id: wish(2).id });
    expect(state.photos).toEqual([]);
    expect(state.wishes.map((w) => w.body)).toEqual(["w1"]);
  });

  it("replaces on a snapshot, so items taken down while away disappear, and merges diffs", () => {
    const stale = { ...EMPTY_LIVE_GALLERY, wishes: [wish(9)], until: at(1) };
    const snapshot: LiveGalleryFeedResponse = { messages: [{ type: "wish", wish: wish(1) }], until: at(10) };
    let state = applyGalleryFeed(stale, snapshot, true);
    expect(state).toMatchObject({ synced: true, until: at(10) });
    expect(state.wishes.map((w) => w.body)).toEqual(["w1"]);

    state = applyGalleryFeed(state, { messages: [{ type: "photo", photo: photo("p2", 12) }], until: at(13) }, false);
    expect(state.wishes).toHaveLength(1);
    expect(state.photos.map((p) => p.publicId)).toEqual(["p2"]);
    expect(state.until).toBe(at(13));
  });

  it("only moves the cursor forward on keepalives", () => {
    let state = applyGalleryMessage(EMPTY_LIVE_GALLERY, { type: "keepalive", until: at(20) });
    state = applyGalleryMessage(state, { type: "keepalive", until: at(5) });
    expect(state.until).toBe(at(20));
  });

  it("drops malformed frames and captions", () => {
    expect(parseGalleryMessage("not json")).toBeNull();
    expect(parseGalleryMessage(JSON.stringify({ type: "segment", segment: {} }))).toBeNull();
    expect(parseGalleryMessage(JSON.stringify({ type: "wish", wish: wish(1) }))).toMatchObject({ type: "wish" });
  });

  it("guards agree with the contract schemas", () => {
    const cases: unknown[] = [
      { type: "wish", wish: wish(1) },
      { type: "photo", photo: photo("p", 1) },
      { type: "hidden", kind: "wish", id: "x" },
      { type: "keepalive", until: at(1) },
      { type: "segment", segment: { sessionId: "s", sequence: 0, startMs: 0, endMs: 1, sourceLanguage: "en", sourceText: "Hi", translations: [] } },
      { type: "hidden", kind: "rsvp", id: "x" },
      { type: "photo", photo: { ...photo("p", 1), width: 0 } },
    ];
    for (const c of cases) expect(isLiveGalleryMessage(c)).toBe(liveGalleryMessageSchema.safeParse(c).success);
    const feed = { messages: cases.slice(0, 4), until: at(2) };
    expect(isLiveGalleryFeedResponse(feed)).toBe(liveGalleryFeedResponseSchema.safeParse(feed).success);
  });
});

class FakeSocket implements SocketLike {
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;
  constructor(readonly url: string) {}
  close() {}
  open() {
    this.onopen?.({});
  }
  fail() {
    this.onclose?.({});
  }
  message(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

function setup(opts: { cursor?: () => string | null; respond?: (url: string) => Response | Promise<Response> } = {}) {
  const sockets: FakeSocket[] = [];
  const links: LiveGalleryLink[] = [];
  const feeds: { response: LiveGalleryFeedResponse; snapshot: boolean }[] = [];
  const messages: unknown[] = [];
  const fetch = vi.fn(async (url: string, _init?: RequestInit) =>
    opts.respond ? opts.respond(url) : new Response(JSON.stringify({ messages: [], until: at(30) }), { status: 200 }),
  );
  const gallery = new LiveGallery({
    apiOrigin: "https://api.example.test",
    cursor: opts.cursor ?? (() => null),
    onMessage: (m) => messages.push(m),
    onFeed: (response, snapshot) => feeds.push({ response, snapshot }),
    onLink: (l) => links.push(l),
    pollMs: 5_000,
    fetch: fetch as unknown as typeof globalThis.fetch,
    createSocket: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    random: () => 1,
    isOnline: () => true,
  });
  return { gallery, sockets, links, feeds, messages, fetch, last: () => sockets[sockets.length - 1]! };
}

describe("LiveGallery connection", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("opens the public socket, then fetches a snapshot, then applies pushed messages", async () => {
    const { gallery, last, fetch, feeds, messages, links } = setup();
    gallery.start();
    expect(last().url).toBe("wss://api.example.test/live/gallery");
    last().open();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch.mock.calls[0]![0]).toBe("https://api.example.test/live/gallery/feed");
    expect(fetch.mock.calls[0]![1]).toMatchObject({ cache: "no-store", credentials: "omit" });
    expect(feeds).toEqual([{ response: { messages: [], until: at(30) }, snapshot: true }]);
    last().message({ type: "wish", wish: wish(1) });
    expect(messages).toHaveLength(1);
    expect(links.at(-1)).toBe("live");
    gallery.stop();
  });

  it("catches up with since after a reconnect", async () => {
    const { gallery, last, fetch, feeds } = setup({ cursor: () => at(30) });
    gallery.start();
    last().open();
    await vi.advanceTimersByTimeAsync(0);
    last().fail();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_000);
    last().open();
    await vi.advanceTimersByTimeAsync(0);
    const urls = fetch.mock.calls.map((c) => c[0]);
    expect(urls.at(-1)).toBe(`https://api.example.test/live/gallery/feed?since=${encodeURIComponent(at(30))}`);
    expect(feeds.at(-1)!.snapshot).toBe(false);
    gallery.stop();
  });

  it("polls the catch-up while the socket cannot open, and stops once it does", async () => {
    const { gallery, last, fetch, links } = setup();
    gallery.start();
    last().fail(); // e.g. 503 past the connection cap, or WebSockets blocked
    await vi.advanceTimersByTimeAsync(0);
    expect(links).toContain("polling");
    const afterProbe = fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetch.mock.calls.length).toBeGreaterThan(afterProbe);

    // Keep the socket down past the backoff, then let one open.
    const sockets = () => fetch.mock.calls.length;
    while (last().onopen === null) await vi.advanceTimersByTimeAsync(100);
    last().open();
    await vi.advanceTimersByTimeAsync(0);
    const whenOpen = sockets();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(sockets()).toBe(whenOpen);
    expect(links.at(-1)).toBe("live");
    gallery.stop();
  });

  it("says offline when neither the socket nor the catch-up answers, and keeps trying", async () => {
    const { gallery, last, links, fetch } = setup({ respond: () => Promise.reject(new TypeError("Failed to fetch")) });
    gallery.start();
    last().fail();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(links.at(-1)).toBe("offline");
    const before = fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetch.mock.calls.length).toBeGreaterThan(before);
    gallery.stop();
  });

  it("leaves nothing running after stop", async () => {
    const { gallery, fetch, sockets } = setup();
    gallery.start();
    gallery.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).not.toHaveBeenCalled();
    expect(sockets).toHaveLength(1);
  });
});
