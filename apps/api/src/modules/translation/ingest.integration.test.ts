import type { IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import { loadConfig } from "../../config.js";
import { buildServer } from "../../server.js";
import { approvedTester } from "../admin/admin-accounts.fake.js";
import type { DisplaySource } from "../live/display.repository.js";
import { CLOSE_REPLACED } from "./ingest.proxy.js";
import { fakeTranslationStore } from "./translation.fake.js";

/**
 * End to end over real sockets: a capture client streams to `WS /live/ingest`,
 * the API relays to a fake translation service, which posts a segment back,
 * and a phone on `WS /live/translation` receives it.
 */
const TRANSLATION_TOKEN = "translation-service-token-value";
const INGEST_TOKEN = "capture-client-token-value";
const emptyDisplay: DisplaySource = { now: async () => new Date(), changesSince: async () => [], snapshot: async () => [] };

type Received = { kind: "text"; text: string } | { kind: "audio"; bytes: Buffer };

/** A stand-in for apps/translation's ingest socket that records what arrives. */
async function fakeTranslationService() {
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await new Promise<void>((resolve) => wss.once("listening", resolve));
  const connections: { socket: WebSocket; headers: IncomingHttpHeaders; received: Received[] }[] = [];
  wss.on("connection", (socket, request) => {
    const entry = { socket, headers: request.headers, received: [] as Received[] };
    connections.push(entry);
    socket.on("message", (data, isBinary) => {
      const buffer = data as Buffer;
      entry.received.push(isBinary ? { kind: "audio", bytes: buffer } : { kind: "text", text: buffer.toString() });
    });
  });
  const port = (wss.address() as AddressInfo).port;
  return {
    url: `ws://127.0.0.1:${port}/ingest`,
    connections,
    close: () => new Promise<void>((resolve) => {
      for (const c of wss.clients) c.terminate();
      wss.close(() => resolve());
    }),
  };
}

const cleanup: Array<() => Promise<unknown> | void> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

async function api(upstreamUrl: string | undefined, ingest: { maxUpstreamBufferedBytes?: number } = {}) {
  const config = loadConfig({
    LOG_LEVEL: "silent",
    SERVICE_TOKEN_TRANSLATION: TRANSLATION_TOKEN,
    SERVICE_TOKEN_INGEST: INGEST_TOKEN,
    ...(upstreamUrl ? { TRANSLATION_INGEST_URL: upstreamUrl } : {}),
  });
  const app = buildServer({
    adminAccounts: approvedTester(),
    config,
    live: {
      displaySource: emptyDisplay,
      translation: { store: fakeTranslationStore().store, ingest: { reconnectMinMs: 20, reconnectMaxMs: 50, ...ingest } },
    },
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  cleanup.push(() => app.close());
  const port = (app.server.address() as AddressInfo).port;
  return { app, http: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}` };
}

/** A client socket that records JSON messages and its close code. */
async function connect(url: string, headers: Record<string, string> = {}) {
  const socket = new WebSocket(url, { headers });
  const messages: Record<string, unknown>[] = [];
  const closed: { code?: number } = {};
  socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
  socket.on("close", (code) => (closed.code = code));
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  cleanup.push(() => socket.terminate());
  return { socket, messages, closed };
}

async function until(check: () => boolean, timeoutMs = 2000, intervalMs = 10): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** 20 ms of 16 kHz s16le mono, filled with a recognizable byte. */
const frame = (fill: number) => Buffer.alloc(640, fill);
const capture = (ws: string) => connect(`${ws}/live/ingest`, { authorization: `Bearer ${INGEST_TOKEN}` });
const statuses = (messages: Record<string, unknown>[]) => messages.filter((m) => m.type === "status").map((m) => m.upstream);

describe("ingest proxy and segment fan-out", () => {
  it("relays audio to the translation service and fans its segments out to phones", async () => {
    const upstream = await fakeTranslationService();
    cleanup.push(upstream.close);
    const { http, ws } = await api(upstream.url);

    const phone = await connect(`${ws}/live/translation?lang=de`);
    await until(() => phone.messages.length > 0);
    expect(phone.messages[0]).toMatchObject({ type: "status", state: "unavailable" });

    const mic = await capture(ws);
    await until(() => statuses(mic.messages).includes("connected"));
    // The API authenticates itself to the service with the translation token.
    expect(upstream.connections[0].headers.authorization).toBe(`Bearer ${TRANSLATION_TOKEN}`);
    await until(() => phone.messages.some((m) => m.type === "status" && m.state === "live"));

    mic.socket.send(JSON.stringify({ type: "start", sessionId: "ceremony", sourceLanguage: "en" }));
    mic.socket.send(frame(1));
    mic.socket.send(Buffer.alloc(641, 9)); // half a sample: dropped
    mic.socket.send(frame(2));
    await until(() => upstream.connections[0].received.length >= 3);
    const received = upstream.connections[0].received;
    expect(received[0]).toEqual({ kind: "text", text: JSON.stringify({ type: "start", sessionId: "ceremony", sourceLanguage: "en" }) });
    expect(received.slice(1).map((r) => (r.kind === "audio" ? r.bytes[0] : r.kind))).toEqual([1, 2]);
    expect(received.slice(1).every((r) => r.kind === "audio" && r.bytes.length === 640)).toBe(true);

    // The service relays readiness to the capture client...
    upstream.connections[0].socket.send(JSON.stringify({ type: "ready" }));
    await until(() => mic.messages.some((m) => m.type === "ready"));

    // ...and posts what it heard back to the API.
    const res = await fetch(`${http}/internal/translation/segments`, {
      method: "POST",
      headers: { authorization: `Bearer ${TRANSLATION_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: "ceremony",
        sequence: 0,
        startMs: 0,
        endMs: 1200,
        sourceLanguage: "en",
        sourceText: "Good morning",
        translations: [
          { language: "de", status: "draft", text: "Guten Morgen", provider: "mock" },
          { language: "vi", status: "draft", text: "Chào buổi sáng", provider: "mock" },
        ],
      }),
    });
    expect(res.status).toBe(200);
    await until(() => phone.messages.some((m) => m.type === "segment"));
    expect(phone.messages.find((m) => m.type === "segment")).toMatchObject({
      segment: { sourceText: "Good morning", translations: [{ language: "de", text: "Guten Morgen" }] },
    });
  });

  it("drops audio while the service is gone, reconnects by itself and replays start first", async () => {
    const upstream = await fakeTranslationService();
    cleanup.push(upstream.close);
    const { ws } = await api(upstream.url);
    const mic = await capture(ws);
    await until(() => statuses(mic.messages).includes("connected"));
    const start = JSON.stringify({ type: "start", sourceLanguage: "vi" });
    mic.socket.send(start);
    await until(() => upstream.connections[0].received.length === 1);

    upstream.connections[0].socket.terminate();
    await until(() => statuses(mic.messages).at(-1) === "unavailable");
    await until(() => upstream.connections.length === 2);
    await until(() => statuses(mic.messages).at(-1) === "connected");

    mic.socket.send(frame(7));
    await until(() => upstream.connections[1].received.length >= 2);
    expect(upstream.connections[1].received[0]).toEqual({ kind: "text", text: start });
    expect(upstream.connections[1].received[1]).toMatchObject({ kind: "audio" });
  });

  it("drops audio instead of queueing it when the service falls behind", async () => {
    const upstream = await fakeTranslationService();
    cleanup.push(upstream.close);
    const { ws } = await api(upstream.url, { maxUpstreamBufferedBytes: 4096 });
    const mic = await capture(ws);
    await until(() => statuses(mic.messages).includes("connected"));

    // The service stops reading: its TCP window fills and the API's send buffer grows.
    const raw = (upstream.connections[0].socket as unknown as { _socket: { pause(): void; resume(): void } })._socket;
    raw.pause();
    // 32 MB in maximum-size frames. Linux autotunes loopback socket buffers to
    // several MB, so a smaller burst can vanish into the kernel without the
    // API's own send buffer ever growing.
    const big = Buffer.alloc(16_000, 1);
    const sent = 2000;
    for (let i = 0; i < sent; i++) mic.socket.send(big);
    await until(() => mic.socket.bufferedAmount === 0, 10_000);
    await new Promise((r) => setTimeout(r, 200));
    raw.resume();
    const audioCount = () => upstream.connections[0].received.filter((r) => r.kind === "audio").length;
    let previous = -1;
    await until(() => {
      const now = audioCount();
      const settled = now > 0 && now === previous;
      previous = now;
      return settled;
    }, 10_000, 100);
    const audio = audioCount();
    expect(audio).toBeGreaterThan(0);
    expect(audio).toBeLessThan(sent);
  });

  it("keeps the API working and reports unavailable when the service is absent", async () => {
    const upstream = await fakeTranslationService();
    const absentUrl = upstream.url;
    await upstream.close();
    const { http, ws } = await api(absentUrl);

    const mic = await capture(ws);
    await until(() => mic.messages.length > 0);
    mic.socket.send(frame(3));
    mic.socket.send(frame(4));
    await new Promise((r) => setTimeout(r, 80)); // a few failed reconnects
    expect(statuses(mic.messages)).toEqual(["unavailable"]);
    expect((await fetch(`${http}/healthz`)).status).toBe(200);
    const catchUp = await fetch(`${http}/live/translation/segments`);
    expect(await catchUp.json()).toMatchObject({ state: "unavailable", segments: [] });
  });

  it("lets a new capture client take over and closes the old one with 4001", async () => {
    const upstream = await fakeTranslationService();
    cleanup.push(upstream.close);
    const { ws } = await api(upstream.url);
    const first = await capture(ws);
    await until(() => statuses(first.messages).includes("connected"));

    const second = await capture(ws);
    await until(() => first.closed.code !== undefined);
    expect(first.closed.code).toBe(CLOSE_REPLACED);
    await until(() => statuses(second.messages).includes("connected"));

    second.socket.send(frame(5));
    const latest = () => upstream.connections.at(-1)!;
    await until(() => latest().received.some((r) => r.kind === "audio"));
    expect(upstream.connections).toHaveLength(2);
  });

  it("refuses a capture client without the ingest token over a real socket", async () => {
    const { ws } = await api(undefined);
    await expect(connect(`${ws}/live/ingest`, { authorization: `Bearer ${TRANSLATION_TOKEN}` })).rejects.toThrow(/401/);
  });
});
