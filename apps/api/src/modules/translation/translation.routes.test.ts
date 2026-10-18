import {
  ingestTranslationSegmentResponseSchema,
  liveTranslationMessageSchema,
  liveTranslationSegmentsResponseSchema,
  type IngestTranslationSegmentRequest,
} from "@grad/contract";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import { buildServer } from "../../server.js";
import { approvedTester } from "../admin/admin-accounts.fake.js";
import type { DisplaySource } from "../live/display.repository.js";
import { fakeTranslationStore } from "./translation.fake.js";

const TRANSLATION_TOKEN = "translation-service-token-value";
const INGEST_TOKEN = "capture-client-token-value";
const KIOSK_TOKEN = "kiosk-invitation-token-value";
const SPOKEN = "Welcome to the graduation ceremony";

const config = loadConfig({
  LOG_LEVEL: "silent",
  PUBLIC_ORIGIN: "https://grad26.example",
  SERVICE_TOKEN_TRANSLATION: TRANSLATION_TOKEN,
  SERVICE_TOKEN_INGEST: INGEST_TOKEN,
  LIVE_TRANSLATION_MAX_CLIENTS: "3",
});

const emptyDisplay: DisplaySource = { now: async () => new Date(), changesSince: async () => [], snapshot: async () => [] };

const segment: IngestTranslationSegmentRequest = {
  sessionId: "ceremony",
  sequence: 0,
  startMs: 0,
  endMs: 2400,
  sourceLanguage: "en",
  sourceText: SPOKEN,
  translations: [{ language: "vi", status: "draft", text: "Chào mừng đến lễ tốt nghiệp", provider: "mock" }],
};

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function server(options: { fake?: ReturnType<typeof fakeTranslationStore>; logStream?: { write(line: string): void } } = {}) {
  const fake = options.fake ?? fakeTranslationStore();
  app = buildServer({
    adminAccounts: approvedTester(),
    config: options.logStream ? { ...config, logLevel: "trace" } : config,
    invitationsService: {
      resolveByToken: async (t: string) =>
        t === KIOSK_TOKEN
          ? { status: "ok", invitation: { id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f" } }
          : { status: "invalid" },
    } as never,
    live: { displaySource: emptyDisplay, feed: { pollMs: 60_000, keepaliveMs: 60_000 }, translation: { store: fake.store } },
    ...(options.logStream ? { logStream: options.logStream } : {}),
  });
  await app.ready();
  return { app, fake };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

function post(app: FastifyInstance, body: unknown, token = TRANSLATION_TOKEN) {
  return app.inject({ method: "POST", url: "/internal/translation/segments", headers: bearer(token), payload: body as object });
}

/** Opens a socket and collects every message from the first one on. */
async function listen(app: FastifyInstance, path: string, headers: Record<string, string> = {}) {
  const messages: unknown[] = [];
  const ws = await app.injectWS(path, { headers }, {
    onInit: (socket) => socket.on("message", (data) => messages.push(JSON.parse(data.toString()))),
  });
  return { ws, messages };
}

const settle = () => new Promise((r) => setTimeout(r, 20));

describe("POST /internal/translation/segments", () => {
  it("needs the translation service's own token", async () => {
    const { app } = await server();
    expect((await app.inject({ method: "POST", url: "/internal/translation/segments", payload: segment })).statusCode).toBe(401);
    expect((await post(app, segment, INGEST_TOKEN)).statusCode).toBe(401);
    expect((await post(app, segment, "nope")).statusCode).toBe(401);
  });

  it("rejects a body outside the contract", async () => {
    const { app } = await server();
    expect((await post(app, { ...segment, endMs: -1 })).statusCode).toBe(400);
    expect((await post(app, { ...segment, translations: [{ language: "fr", status: "final", text: "x", provider: null }] })).statusCode).toBe(400);
  });

  it("stores, merges a later final and never revises a final", async () => {
    const { app } = await server();
    const first = await post(app, segment);
    expect(first.statusCode).toBe(200);
    expect(ingestTranslationSegmentResponseSchema.parse(first.json()).changed).toBe(true);

    const final = await post(app, {
      ...segment,
      translations: [
        { language: "vi", status: "final", text: "Chào mừng quý vị đến lễ tốt nghiệp", provider: "local-gpu" },
        { language: "de", status: "failed", text: null, provider: "local-gpu" },
      ],
    });
    expect(final.json().segment.translations).toEqual([
      { language: "de", status: "failed", text: null, provider: "local-gpu" },
      { language: "vi", status: "final", text: "Chào mừng quý vị đến lễ tốt nghiệp", provider: "local-gpu" },
    ]);

    const late = await post(app, segment);
    expect(late.json().changed).toBe(false);
    expect(late.json().segment.translations[1].status).toBe("final");
  });

  it("answers 503 with Retry-After when storage is down, and the rest of the API still works", async () => {
    const fake = fakeTranslationStore();
    fake.fail();
    const { app } = await server({ fake });
    const res = await post(app, segment);
    expect(res.statusCode).toBe(503);
    expect(res.headers["retry-after"]).toBe("5");
    expect((await app.inject({ method: "GET", url: "/healthz" })).statusCode).toBe(200);
  });
});

describe("WS /live/translation", () => {
  it("delivers a posted segment to listeners in their language and to the display", async () => {
    const { app } = await server();
    const { ws: vi, messages: viMessages } = await listen(app, "/live/translation?lang=vi", { origin: config.publicOrigin });
    const { ws: de, messages: deMessages } = await listen(app, "/live/translation?lang=de");
    const { ws: display, messages: displayMessages } = await listen(app, "/live/display", { cookie: `inv=${KIOSK_TOKEN}` });

    await post(app, segment);
    await settle();

    for (const m of viMessages) expect(liveTranslationMessageSchema.safeParse(m).success).toBe(true);
    expect(viMessages.at(-1)).toMatchObject({ type: "segment", segment: { sourceText: SPOKEN, translations: [{ language: "vi" }] } });
    expect(deMessages.at(-1)).toMatchObject({ type: "segment", segment: { sourceText: SPOKEN, translations: [] } });
    expect(displayMessages.at(-1)).toMatchObject({ type: "segment", segment: { sequence: 0 } });
    for (const ws of [vi, de, display]) ws.terminate();
  });

  it("starts a new listener with status and the recent segments", async () => {
    const { app } = await server();
    await post(app, segment);
    const { ws, messages } = await listen(app, "/live/translation");
    await settle();
    expect(messages[0]).toMatchObject({ type: "status", state: "live" });
    expect(messages[1]).toMatchObject({ type: "segment", segment: { sequence: 0 } });
    ws.terminate();
  });

  it("refuses a foreign origin, an unknown language and connections past the limit", async () => {
    const { app } = await server();
    await expect(app.injectWS("/live/translation", { headers: { origin: "https://evil.example" } })).rejects.toThrow("403");
    await expect(app.injectWS("/live/translation?lang=fr")).rejects.toThrow("400");
    const open = [];
    for (let i = 0; i < 3; i++) open.push(await app.injectWS("/live/translation"));
    await settle();
    await expect(app.injectWS("/live/translation")).rejects.toThrow("503");
    for (const ws of open) ws.terminate();
  });
});

describe("GET /live/translation/segments", () => {
  it("returns what changed since a watermark, filtered by language", async () => {
    const { app } = await server();
    const empty = await app.inject({ method: "GET", url: "/live/translation/segments" });
    expect(empty.statusCode).toBe(200);
    const { until } = liveTranslationSegmentsResponseSchema.parse(empty.json());
    await post(app, segment);
    await post(app, { ...segment, sequence: 1, sourceText: "Please be seated" });

    const res = await app.inject({ method: "GET", url: `/live/translation/segments?since=${encodeURIComponent(until)}&lang=de` });
    expect(res.statusCode).toBe(200);
    const body = liveTranslationSegmentsResponseSchema.parse(res.json());
    expect(body.segments.map((s) => s.sequence)).toEqual([0, 1]);
    expect(body.segments.every((s) => s.translations.length === 0)).toBe(true);
    expect(body.state).toBe("live");
    expect(Date.parse(body.until)).toBeGreaterThan(Date.parse(until));
  });

  it("validates since and lang", async () => {
    const { app } = await server();
    expect((await app.inject({ method: "GET", url: "/live/translation/segments?since=yesterday" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/live/translation/segments?lang=fr" })).statusCode).toBe(400);
  });

  it("answers 503 when storage is down", async () => {
    const fake = fakeTranslationStore();
    fake.fail();
    const { app } = await server({ fake });
    const res = await app.inject({ method: "GET", url: "/live/translation/segments" });
    expect(res.statusCode).toBe(503);
  });
});

describe("WS /live/ingest", () => {
  it("needs the capture client's own token", async () => {
    const { app } = await server();
    await expect(app.injectWS("/live/ingest")).rejects.toThrow("401");
    await expect(app.injectWS("/live/ingest", { headers: bearer(TRANSLATION_TOKEN) })).rejects.toThrow("401");
  });

  it("accepts the capture client and reports unavailable without a translation service", async () => {
    const { app } = await server();
    const { ws, messages } = await listen(app, "/live/ingest", bearer(INGEST_TOKEN));
    await settle();
    expect(messages).toEqual([{ type: "status", upstream: "unavailable", droppedFrames: 0 }]);
    ws.terminate();
  });

  it("fails closed when no ingest token is configured", async () => {
    app = buildServer({
      adminAccounts: approvedTester(),
      config: { ...config, serviceTokens: { ...config.serviceTokens, ingest: undefined } },
      live: { displaySource: emptyDisplay, translation: { store: fakeTranslationStore().store } },
    });
    await app.ready();
    await expect(app.injectWS("/live/ingest", { headers: bearer("") })).rejects.toThrow("401");
  });
});

describe("token and speech hygiene in logs", () => {
  it("never writes service tokens or segment text to the log", async () => {
    const lines: string[] = [];
    const fake = fakeTranslationStore();
    const { app } = await server({ fake, logStream: { write: (line) => void lines.push(line) } });
    await post(app, segment);
    const ws = await app.injectWS("/live/ingest", { headers: bearer(INGEST_TOKEN) });
    ws.terminate();
    fake.fail();
    await post(app, segment);
    await app.close();
    const output = lines.join("");
    expect(output).toContain("/internal/translation/segments");
    expect(output).not.toContain(TRANSLATION_TOKEN);
    expect(output).not.toContain(INGEST_TOKEN);
    expect(output).not.toContain(SPOKEN);
  });
});

describe("config", () => {
  it("reads the ingest settings, with ingest optional in production", () => {
    const c = loadConfig({ TRANSLATION_INGEST_URL: "ws://translation:8000/ingest", SERVICE_TOKEN_INGEST: "x" });
    expect(c.translation).toEqual({ ingestUrl: "ws://translation:8000/ingest", maxClients: 1000 });
    expect(c.serviceTokens.ingest).toBe("x");
    expect(() => loadConfig({ TRANSLATION_INGEST_URL: "not a url" })).toThrow();
  });
});
