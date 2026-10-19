import { describe, expect, it } from "vitest";
import { ingestControlMessageSchema, ingestServiceMessageSchema } from "./index.js";

// The messages apps/translation adds to the ingest protocol (#67, #69).
describe("ingest protocol, translation service side", () => {
  it("accepts a gap the capture client reports after dropping audio", () => {
    expect(ingestControlMessageSchema.safeParse({ type: "gap", samples: 16000 }).success).toBe(true);
    expect(ingestControlMessageSchema.safeParse({ type: "gap", samples: -1 }).success).toBe(false);
    expect(ingestControlMessageSchema.safeParse({ type: "gap" }).success).toBe(false);
  });

  it("describes what the service sends back through the API", () => {
    const ok = [
      { type: "ready", sessionId: "ceremony-20261120T020000Z", resumed: false },
      { type: "ack", receivedSamples: 4800 },
      { type: "error", code: "unsupported_format", message: "audio must be 16000 Hz, 1 channel, s16le" },
    ];
    for (const message of ok) expect(ingestServiceMessageSchema.safeParse(message).success).toBe(true);
    expect(ingestServiceMessageSchema.safeParse({ type: "ack", receivedSamples: 1.5 }).success).toBe(false);
    expect(ingestServiceMessageSchema.safeParse({ type: "ready", sessionId: "" }).success).toBe(false);
  });
});
