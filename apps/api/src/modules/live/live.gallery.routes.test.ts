import { liveGalleryFeedResponseSchema, liveGalleryMessageSchema, type LiveGalleryMessage } from "@grad/contract";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config.js";
import type { ChangeNotifier } from "../../db/notify.js";
import { buildServer } from "../../server.js";
import { approvedTester } from "../admin/admin-accounts.fake.js";
import type { DisplayChange, DisplaySource } from "./display.repository.js";

const config = loadConfig({ LOG_LEVEL: "silent", PUBLIC_ORIGIN: "https://grad26.example", LIVE_GALLERY_MAX_CLIENTS: "2" });
const T0 = new Date("2026-11-15T03:00:00.000Z");
const WISH_ID = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e71";

function fakeSource() {
  let tick = 0;
  const rows: DisplayChange[] = [];
  const clock = () => new Date(T0.getTime() + tick * 1000);
  const source: DisplaySource = {
    now: async () => {
      tick++;
      return clock();
    },
    changesSince: async (since) => rows.filter((r) => r.updatedAt > since),
    snapshot: async () => rows.filter((r) => r.message.type !== "hidden").map((r) => r.message),
  };
  const add = (message: LiveGalleryMessage, key: string) => {
    const updatedAt = clock();
    rows.push({ key, version: updatedAt.toISOString(), updatedAt, message });
  };
  const addWish = (id: string) =>
    add({ type: "wish", wish: { id, authorName: "Jane", body: "Congrats!", createdAt: clock().toISOString() } }, `wish:${id}`);
  const hidePhoto = (publicId: string) => add({ type: "hidden", kind: "photo", id: publicId }, `photo:${publicId}`);
  return { source, addWish, hidePhoto };
}

/** A notifier the test fires by hand, standing in for Postgres LISTEN. */
function fakeNotifier() {
  let onNotify: () => void = () => {};
  const notifier: ChangeNotifier & { fire(): void } = {
    start: vi.fn((handlers) => {
      onNotify = handlers.onNotify;
    }),
    stop: vi.fn(async () => {}),
    fire: () => onNotify(),
  };
  return notifier;
}

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function server(source: DisplaySource, changes: ChangeNotifier | null = null, pollMs = 10) {
  app = buildServer({
    adminAccounts: approvedTester(),
    config,
    invitationsService: { resolveByToken: async () => ({ status: "invalid" }) } as never,
    live: { displaySource: source, changes, feed: { pollMs, keepaliveMs: 60_000 } },
  });
  await app.ready();
  return app;
}

function nextMessage(ws: { once(event: "message", cb: (data: Buffer) => void): void }): Promise<LiveGalleryMessage> {
  return new Promise((resolve) => ws.once("message", (data) => resolve(JSON.parse(data.toString()))));
}

const fromSite = { origin: "https://grad26.example" };

describe("WS /live/gallery", () => {
  it("is public: no invitation needed, wishes arrive as they are written", async () => {
    const { source, addWish } = fakeSource();
    const app = await server(source);
    const ws = await app.injectWS("/live/gallery", { headers: fromSite });
    const received = nextMessage(ws);
    await new Promise((r) => setTimeout(r, 30));
    addWish(WISH_ID);
    const message = await received;
    expect(liveGalleryMessageSchema.safeParse(message).success).toBe(true);
    expect(message).toMatchObject({ type: "wish", wish: { id: WISH_ID } });
    ws.terminate();
  });

  it("refuses a foreign origin", async () => {
    const app = await server(fakeSource().source);
    await expect(app.injectWS("/live/gallery", { headers: { origin: "https://evil.example" } })).rejects.toThrow("403");
  });

  it("answers 503 past the connection cap, so pages fall back to polling", async () => {
    const app = await server(fakeSource().source);
    const a = await app.injectWS("/live/gallery", { headers: fromSite });
    const b = await app.injectWS("/live/gallery", { headers: fromSite });
    await expect(app.injectWS("/live/gallery", { headers: fromSite })).rejects.toThrow("503");
    a.terminate();
    b.terminate();
  });

  it("pushes within one query of a NOTIFY, not one poll interval", async () => {
    const { source, addWish } = fakeSource();
    const changes = fakeNotifier();
    // A poll interval far longer than the test: only the notification can deliver it.
    const app = await server(source, changes, 60_000);
    const ws = await app.injectWS("/live/gallery", { headers: fromSite });
    await vi.waitFor(() => expect(changes.start).toHaveBeenCalledOnce());
    await new Promise((r) => setTimeout(r, 20));
    const received = nextMessage(ws);
    addWish(WISH_ID);
    changes.fire();
    expect(await received).toMatchObject({ type: "wish", wish: { id: WISH_ID } });
    ws.terminate();
    // The last listener leaving stops the feed and closes the LISTEN connection.
    await vi.waitFor(() => expect(changes.stop).toHaveBeenCalledOnce());
  });
});

describe("GET /live/gallery/feed", () => {
  it("is public and never cached; returns the snapshot without since", async () => {
    const { source, addWish } = fakeSource();
    const app = await server(source);
    addWish(WISH_ID);
    const res = await app.inject({ method: "GET", url: "/live/gallery/feed" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(liveGalleryFeedResponseSchema.safeParse(res.json()).success).toBe(true);
    expect(res.json().messages).toHaveLength(1);
  });

  it("returns takedowns since a cursor as bare ids", async () => {
    const { source, hidePhoto } = fakeSource();
    const app = await server(source);
    hidePhoto("p-hidden");
    const res = await app.inject({ method: "GET", url: `/live/gallery/feed?since=${encodeURIComponent(T0.toISOString())}` });
    expect(res.json().messages).toEqual([{ type: "hidden", kind: "photo", id: "p-hidden" }]);
  });

  it("refuses a foreign origin and a bad cursor", async () => {
    const app = await server(fakeSource().source);
    expect((await app.inject({ method: "GET", url: "/live/gallery/feed", headers: { origin: "https://evil.example" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/live/gallery/feed?since=yesterday" })).statusCode).toBe(400);
  });

  it("answers 503 with Retry-After when the database is down", async () => {
    const source: DisplaySource = {
      now: async () => {
        throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
      },
      changesSince: async () => [],
      snapshot: async () => [],
    };
    const app = await server(source);
    const res = await app.inject({ method: "GET", url: "/live/gallery/feed" });
    expect(res.statusCode).toBe(503);
    expect(res.headers["retry-after"]).toBe("5");
  });
});
