import { liveDisplayFeedResponseSchema, liveDisplayMessageSchema, type LiveDisplayMessage } from "@grad/contract";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import { buildServer } from "../../server.js";
import { approvedTester } from "../admin/admin-accounts.fake.js";
import type { ResolveResult } from "../invitations/invitations.service.js";
import type { DisplayChange, DisplaySource } from "./display.repository.js";

const config = loadConfig({ LOG_LEVEL: "silent", PUBLIC_ORIGIN: "https://grad26.example" });
const TOKEN = "kiosk-invitation-token-value";
const T0 = new Date("2026-11-15T03:00:00.000Z");
const WISH_ID = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e71";

const invitation = {
  id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
  guest: { id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70", name: "Event display", email: null, phone: null },
  maxPlusOnes: 0,
  status: "active" as const,
  validFrom: null,
  validUntil: null,
  inviters: [],
  rsvp: null,
};

function resolver(token: string): ResolveResult {
  if (token === TOKEN) return { status: "ok", invitation };
  if (token === "expired") return { status: "expired" };
  return { status: "invalid" };
}

/** Rows appear with the source's clock, which advances on every read. */
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
    snapshot: async () => [],
  };
  const addWish = (id: string) => {
    const updatedAt = clock();
    rows.push({
      key: `wish:${id}`,
      version: updatedAt.toISOString(),
      updatedAt,
      message: { type: "wish", wish: { id, authorName: "Jane", body: "Congrats!", createdAt: updatedAt.toISOString() } },
    });
  };
  return { source, addWish };
}

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function server(source: DisplaySource = fakeSource().source, logStream?: { write(line: string): void }) {
  app = buildServer({
    adminAccounts: approvedTester(),
    config: logStream ? { ...config, logLevel: "trace" } : config,
    invitationsService: { resolveByToken: async (t: string) => resolver(t) } as never,
    live: { displaySource: source, feed: { pollMs: 10, keepaliveMs: 60_000 } },
    ...(logStream ? { logStream } : {}),
  });
  await app.ready();
  return app;
}

const cookie = { cookie: `inv=${TOKEN}` };

function nextMessage(ws: { once(event: "message", cb: (data: Buffer) => void): void }): Promise<LiveDisplayMessage> {
  return new Promise((resolve) => ws.once("message", (data) => resolve(JSON.parse(data.toString()))));
}

describe("WS /live/display", () => {
  it.each([
    ["no credential", {}, "401"],
    ["an unknown token", { cookie: "inv=nope" }, "404"],
    ["an expired invitation", { cookie: "inv=expired" }, "410"],
    ["a foreign origin", { ...cookie, origin: "https://evil.example" }, "403"],
  ])("refuses the upgrade with %s", async (_label, headers, status) => {
    const app = await server();
    await expect(app.injectWS("/live/display", { headers })).rejects.toThrow(status);
  });

  it("delivers a new wish to a connected display (cookie from the public origin)", async () => {
    const { source, addWish } = fakeSource();
    const app = await server(source);
    const ws = await app.injectWS("/live/display", { headers: { ...cookie, origin: config.publicOrigin } });
    const received = nextMessage(ws);
    // Let the first poll set its cursor, then write.
    await new Promise((r) => setTimeout(r, 30));
    addWish(WISH_ID);
    const message = await received;
    expect(liveDisplayMessageSchema.safeParse(message).success).toBe(true);
    expect(message).toMatchObject({ type: "wish", wish: { id: WISH_ID } });
    ws.terminate();
  });

  it("accepts a bearer token from a non-browser client", async () => {
    const app = await server();
    const ws = await app.injectWS("/live/display", { headers: { authorization: `Bearer ${TOKEN}` } });
    ws.terminate();
  });
});

describe("GET /live/display/feed", () => {
  it("requires the invitation credential", async () => {
    const app = await server();
    expect((await app.inject({ method: "GET", url: "/live/display/feed" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/live/display/feed", headers: { authorization: "Bearer nope" } })).statusCode).toBe(404);
  });

  it("returns changes since a timestamp, never cached", async () => {
    const { source, addWish } = fakeSource();
    const app = await server(source);
    addWish(WISH_ID);
    const res = await app.inject({ method: "GET", url: `/live/display/feed?since=${encodeURIComponent(T0.toISOString())}`, headers: cookie });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(liveDisplayFeedResponseSchema.safeParse(res.json()).success).toBe(true);
    expect(res.json().messages).toHaveLength(1);
  });

  it("rejects a since that is not an ISO timestamp", async () => {
    const app = await server();
    const res = await app.inject({ method: "GET", url: "/live/display/feed?since=yesterday", headers: cookie });
    expect(res.statusCode).toBe(400);
  });
});

describe("token hygiene in logs", () => {
  it("never writes the kiosk's token to the log", async () => {
    const lines: string[] = [];
    const app = await server(fakeSource().source, { write: (line) => void lines.push(line) });
    const ws = await app.injectWS("/live/display", { headers: cookie });
    ws.terminate();
    await app.inject({ method: "GET", url: "/live/display/feed", headers: { authorization: `Bearer ${TOKEN}` } });
    await app.close();
    const output = lines.join("");
    expect(output).toContain("/live/display");
    expect(output).not.toContain(TOKEN);
  });
});
