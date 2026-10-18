import { describe, expect, it } from "vitest";
import {
  INGEST_AUDIO_FORMAT,
  INGEST_MAX_FRAME_BYTES,
  ingestControlMessageSchema,
  ingestStatusMessageSchema,
  ingestTranslationSegmentResponseSchema,
  liveDisplayMessageSchema,
  liveTranslationMessageSchema,
  liveTranslationSegmentsQuerySchema,
  liveTranslationSegmentsResponseSchema,
} from "./index.js";

const now = "2026-11-20T03:00:00.000Z";
const segment = {
  sessionId: "ceremony-1",
  sequence: 4,
  startMs: 1000,
  endMs: 3200,
  sourceLanguage: "en",
  sourceText: "Welcome, graduates",
  translations: [{ language: "vi", status: "draft", text: "Chào mừng các tân khoa", provider: "mock" }],
};

describe("translation catch-up", () => {
  it("defaults the limit and accepts a timestamp and a caption language", () => {
    expect(liveTranslationSegmentsQuerySchema.parse({}).limit).toBe(100);
    expect(liveTranslationSegmentsQuerySchema.parse({ since: now, lang: "de", limit: "20" })).toEqual({
      since: now,
      lang: "de",
      limit: 20,
    });
  });

  it("rejects a non-ISO since, an unknown language and an oversized page", () => {
    expect(liveTranslationSegmentsQuerySchema.safeParse({ since: "yesterday" }).success).toBe(false);
    expect(liveTranslationSegmentsQuerySchema.safeParse({ lang: "fr" }).success).toBe(false);
    expect(liveTranslationSegmentsQuerySchema.safeParse({ limit: 500 }).success).toBe(false);
  });

  it("returns segments with a watermark and availability", () => {
    const res = { segments: [segment], until: now, more: false, state: "live" };
    expect(liveTranslationSegmentsResponseSchema.safeParse(res).success).toBe(true);
    expect(liveTranslationSegmentsResponseSchema.safeParse({ ...res, state: "paused" }).success).toBe(false);
  });

  it("acknowledges an ingested segment with whether it changed", () => {
    expect(ingestTranslationSegmentResponseSchema.safeParse({ segment, changed: true }).success).toBe(true);
  });
});

describe("live translation socket", () => {
  it("carries a watermark on segment, status and keepalive", () => {
    expect(liveTranslationMessageSchema.safeParse({ type: "segment", segment, until: now }).success).toBe(true);
    expect(liveTranslationMessageSchema.safeParse({ type: "status", state: "live", until: now }).success).toBe(true);
    expect(liveTranslationMessageSchema.safeParse({ type: "keepalive", until: now }).success).toBe(true);
    expect(liveTranslationMessageSchema.safeParse({ type: "keepalive", until: "soon" }).success).toBe(false);
  });

  it("lets the display carry captions", () => {
    expect(liveDisplayMessageSchema.safeParse({ type: "segment", segment }).success).toBe(true);
  });
});

describe("ingest protocol", () => {
  it("fixes the audio format and bounds a frame", () => {
    expect(INGEST_AUDIO_FORMAT).toEqual({ sampleRate: 16000, channels: 1, encoding: "s16le" });
    expect(INGEST_MAX_FRAME_BYTES % 2).toBe(0);
  });

  it("accepts start with or without details, and stop", () => {
    expect(ingestControlMessageSchema.safeParse({ type: "start" }).success).toBe(true);
    expect(
      ingestControlMessageSchema.safeParse({ type: "start", sessionId: "ceremony-1", sourceLanguage: "vi", sampleRate: 16000 })
        .success,
    ).toBe(true);
    expect(ingestControlMessageSchema.safeParse({ type: "stop" }).success).toBe(true);
  });

  it("rejects a format the API would have to convert", () => {
    expect(ingestControlMessageSchema.safeParse({ type: "start", sampleRate: 48000 }).success).toBe(false);
    expect(ingestControlMessageSchema.safeParse({ type: "start", encoding: "f32le" }).success).toBe(false);
  });

  it("reports upstream state to the capture client", () => {
    expect(ingestStatusMessageSchema.safeParse({ type: "status", upstream: "connected", droppedFrames: 0 }).success).toBe(true);
    expect(ingestStatusMessageSchema.safeParse({ type: "status", upstream: "up", droppedFrames: 0 }).success).toBe(false);
  });
});
