import type { IngestTranslationSegmentRequest, LiveTranslationMessage } from "@grad/contract";
import type { WebSocket } from "@fastify/websocket";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeTranslationStore } from "./translation.fake.js";
import { forLanguage, TranslationFeed } from "./translation.feed.js";

class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  bufferedAmount = 0;
  sent: string[] = [];
  terminated = false;
  closed: [number, string] | undefined;
  send(data: string) {
    this.sent.push(data);
  }
  ping() {}
  terminate() {
    this.terminated = true;
    this.readyState = 3;
    this.emit("close");
  }
  close(code: number, reason: string) {
    this.closed = [code, reason];
    this.readyState = 3;
    this.emit("close");
  }
  messages(): LiveTranslationMessage[] {
    return this.sent.map((s) => JSON.parse(s));
  }
}

const asSocket = (s: FakeSocket) => s as unknown as WebSocket;
const log = { warn: vi.fn(), error: vi.fn() };

function segment(sequence: number, overrides: Partial<IngestTranslationSegmentRequest> = {}): IngestTranslationSegmentRequest {
  return {
    sessionId: "ceremony",
    sequence,
    startMs: sequence * 1000,
    endMs: sequence * 1000 + 900,
    sourceLanguage: "en",
    sourceText: `Sentence ${sequence}`,
    translations: [
      { language: "de", status: "draft", text: `Satz ${sequence}`, provider: "mock" },
      { language: "vi", status: "final", text: `Câu ${sequence}`, provider: "mock" },
    ],
    ...overrides,
  };
}

/** Stores and publishes, like the POST route. */
async function post(feed: TranslationFeed, store: ReturnType<typeof fakeTranslationStore>["store"], s: IngestTranslationSegmentRequest) {
  const result = await store.upsert(s);
  if (result.changed) feed.publish(result);
  return result;
}

afterEach(() => vi.useRealTimers());

describe("forLanguage", () => {
  it("keeps the source text and only the asked-for caption", () => {
    const s = segment(1);
    expect(forLanguage(s, "vi").translations.map((t) => t.language)).toEqual(["vi"]);
    expect(forLanguage(s, "vi").sourceText).toBe("Sentence 1");
    expect(forLanguage(s, undefined)).toBe(s);
  });
});

describe("TranslationFeed", () => {
  it("sends status and the recent segments on connect, then live updates, per language", async () => {
    const { store } = fakeTranslationStore();
    const feed = new TranslationFeed(store, log);
    await post(feed, store, segment(0));

    const viSocket = new FakeSocket();
    const all = new FakeSocket();
    await feed.subscribe(asSocket(viSocket), "vi");
    await feed.subscribe(asSocket(all), undefined);

    expect(viSocket.messages()[0]).toMatchObject({ type: "status", state: "live" });
    expect(viSocket.messages()[1]).toMatchObject({ type: "segment", segment: { sequence: 0, translations: [{ language: "vi" }] } });
    expect((all.messages()[1] as { segment: { translations: unknown[] } }).segment.translations).toHaveLength(2);

    await post(feed, store, segment(1));
    const last = viSocket.messages().at(-1)!;
    expect(last).toMatchObject({ type: "segment", segment: { sequence: 1 } });
    expect((last as { until?: string }).until).toBeDefined();
    expect((last as { segment: { translations: unknown[] } }).segment.translations).toHaveLength(1);
    feed.close();
  });

  it("forwards every change to the sinks (the display) with all languages", async () => {
    const { store } = fakeTranslationStore();
    const sink = vi.fn();
    const feed = new TranslationFeed(store, log, {}, [sink]);
    await post(feed, store, segment(0));
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ sequence: 0, translations: expect.arrayContaining([expect.anything(), expect.anything()]) }));
  });

  it("does not broadcast a re-post that changed nothing", async () => {
    const { store } = fakeTranslationStore();
    const feed = new TranslationFeed(store, log);
    const socket = new FakeSocket();
    await feed.subscribe(asSocket(socket), undefined);
    await post(feed, store, segment(0));
    const before = socket.sent.length;
    const again = await post(feed, store, segment(0));
    expect(again.changed).toBe(false);
    expect(socket.sent.length).toBe(before);
    feed.close();
  });

  it("is live while ingest streams or segments keep coming, unavailable otherwise", async () => {
    vi.useFakeTimers();
    const { store } = fakeTranslationStore();
    const feed = new TranslationFeed(store, log, { keepaliveMs: 1000, liveWindowMs: 5000 });
    const socket = new FakeSocket();
    await feed.subscribe(asSocket(socket), "de");
    expect(socket.messages()[0]).toMatchObject({ type: "status", state: "unavailable" });

    feed.setIngestLive(true);
    expect(socket.messages().at(-1)).toMatchObject({ type: "status", state: "live" });
    feed.setIngestLive(false);
    expect(socket.messages().at(-1)).toMatchObject({ type: "status", state: "unavailable" });

    // A provider posting without ingest (e.g. the mock) counts as live for a while.
    await post(feed, store, segment(0));
    expect(feed.state).toBe("live");
    vi.advanceTimersByTime(6000);
    expect(feed.state).toBe("unavailable");
    const states = socket.messages().filter((m) => m.type === "status").map((m) => (m as { state: string }).state);
    expect(states).toEqual(["unavailable", "live", "unavailable", "live", "unavailable"]);
    expect(socket.messages().some((m) => m.type === "keepalive")).toBe(true);
    feed.close();
  });

  it("enforces the connection limit across languages", async () => {
    const { store } = fakeTranslationStore();
    const feed = new TranslationFeed(store, log, { maxClients: 2 });
    await feed.subscribe(asSocket(new FakeSocket()), "de");
    expect(feed.full).toBe(false);
    await feed.subscribe(asSocket(new FakeSocket()), "en");
    expect(feed.full).toBe(true);
    const third = new FakeSocket();
    await feed.subscribe(asSocket(third), undefined);
    expect(third.closed?.[0]).toBe(1013);
    expect(feed.clientCount).toBe(2);
    feed.close();
  });

  it("drops a listener that is backed up during its snapshot", async () => {
    const { store } = fakeTranslationStore();
    const feed = new TranslationFeed(store, log);
    for (let i = 0; i < 3; i++) await post(feed, store, segment(i));
    const slow = new FakeSocket();
    slow.bufferedAmount = 2 * 1024 * 1024;
    await feed.subscribe(asSocket(slow), undefined);
    expect(slow.terminated).toBe(true);
    expect(feed.clientCount).toBe(0);
  });

  it("keeps a bounded number of segments in memory and still answers older catch-up from the store", async () => {
    const { store, calls } = fakeTranslationStore();
    const feed = new TranslationFeed(store, log, { recentLimit: 3, snapshotLimit: 2, overlapMs: 0 });
    await feed.catchUp(undefined, undefined, 10); // primes from the empty store
    const t0 = (await store.now()).toISOString();
    for (let i = 0; i < 5; i++) await post(feed, store, segment(i));

    const socket = new FakeSocket();
    await feed.subscribe(asSocket(socket), undefined);
    expect(socket.messages().filter((m) => m.type === "segment").map((m) => (m as { segment: { sequence: number } }).segment.sequence)).toEqual([3, 4]);

    // Recent enough: memory answers without touching the store.
    const before = calls.changesSince;
    const recentPage = await feed.catchUp(new Date(Date.parse(t0) + 3500), undefined, 10);
    expect(recentPage.segments.map((s) => s.sequence)).toEqual([3, 4]);
    expect(calls.changesSince).toBe(before);

    // Older than memory holds: the store answers, completely.
    const full = await feed.catchUp(new Date(t0), "de", 10);
    expect(calls.changesSince).toBe(before + 1);
    expect(full.segments.map((s) => s.sequence)).toEqual([0, 1, 2, 3, 4]);
    expect(full.segments[0].translations.map((t) => t.language)).toEqual(["de"]);
    expect(full.more).toBe(false);
    feed.close();
  });

  it("pages a long catch-up with more and a resumable until", async () => {
    const { store } = fakeTranslationStore();
    const feed = new TranslationFeed(store, log, { recentLimit: 2, overlapMs: 0 });
    const t0 = new Date((await store.now()).getTime() - 1);
    for (let i = 0; i < 5; i++) await post(feed, store, segment(i));
    const first = await feed.catchUp(t0, undefined, 2);
    expect(first.segments.map((s) => s.sequence)).toEqual([0, 1]);
    expect(first.more).toBe(true);
    const second = await feed.catchUp(new Date(first.until), undefined, 2);
    expect(second.segments.map((s) => s.sequence)).toEqual([2, 3]);
  });

  it("loads recent segments after a restart and survives a database that is down", async () => {
    const fake = fakeTranslationStore();
    for (let i = 0; i < 2; i++) await fake.store.upsert(segment(i));
    const fresh = new TranslationFeed(fake.store, log);
    const socket = new FakeSocket();
    await fresh.subscribe(asSocket(socket), undefined);
    expect(socket.messages().filter((m) => m.type === "segment")).toHaveLength(2);
    fresh.close();

    const down = fakeTranslationStore();
    down.fail();
    const feed = new TranslationFeed(down.store, log);
    const listener = new FakeSocket();
    await feed.subscribe(asSocket(listener), undefined);
    expect(listener.messages()).toEqual([{ type: "status", state: "unavailable" }]);
    expect(log.error).toHaveBeenCalled();
    await expect(feed.catchUp(undefined, undefined, 10)).rejects.toThrow();
    feed.close();
  });
});
