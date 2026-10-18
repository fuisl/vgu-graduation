import {
  liveDisplayFeedResponseSchema,
  liveDisplayMessageSchema,
  liveTranslationMessageSchema,
  translationBacklogResponseSchema,
} from "@grad/contract";
import { describe, expect, it } from "vitest";
import { isLiveDisplayFeedResponse, isLiveDisplayMessage, isLiveTranslationMessage, isTranslationBacklog } from "./guards";

const at = "2026-10-24T09:00:00.000Z";
const segment = {
  sessionId: "s1",
  sequence: 0,
  startMs: 0,
  endMs: 900,
  sourceLanguage: "en",
  sourceText: "Hello",
  translations: [
    { language: "vi", status: "final", text: "Xin chào", provider: "mock" },
    { language: "de", status: "failed", text: null, provider: null },
  ],
};
const wish = { id: "00000000-0000-4000-8000-000000000001", authorName: "Linh", body: "Congrats", createdAt: at };
const photo = { publicId: "abc", width: 1600, height: null, createdAt: "2026-10-24T16:00:00+07:00" };

const displayCases: unknown[] = [
  { type: "wish", wish },
  { type: "photo", photo },
  { type: "segment", segment },
  { type: "hidden", kind: "photo", id: "abc" },
  { type: "keepalive", until: at },
  { type: "wish", wish: { ...wish, id: "not-a-uuid" } },
  { type: "wish", wish: { ...wish, createdAt: "yesterday" } },
  { type: "wish", wish: { ...wish, createdAt: "2026-10-24T09:00:00" } },
  { type: "photo", photo: { ...photo, width: 0 } },
  { type: "photo", photo: { ...photo, publicId: "" } },
  { type: "hidden", kind: "rsvp", id: "x" },
  { type: "hidden", kind: "wish", id: "" },
  { type: "segment", segment: { ...segment, endMs: -1 } },
  { type: "segment", segment: { ...segment, sequence: 1.5 } },
  { type: "segment", segment: { ...segment, sourceLanguage: "de" } },
  { type: "segment", segment: { ...segment, translations: [{ language: "fr", status: "final", text: "x", provider: null }] } },
  { type: "segment", segment: { ...segment, translations: [{ language: "vi", status: "draft", text: null, provider: null }] } },
  { type: "keepalive" },
  { type: "other" },
  null,
  [],
  "wish",
];

const translationCases: unknown[] = [
  { type: "segment", segment },
  { type: "status", state: "live" },
  { type: "status", state: "unavailable" },
  { type: "status", state: "paused" },
  { type: "segment", segment: { ...segment, sourceText: "" } },
  { type: "segment" },
  {},
];

describe("guards agree with the contract schemas", () => {
  it.each(displayCases.map((c, i) => [i, c]))("display message case %i", (_, value) => {
    expect(isLiveDisplayMessage(value)).toBe(liveDisplayMessageSchema.safeParse(value).success);
  });

  it.each(translationCases.map((c, i) => [i, c]))("translation message case %i", (_, value) => {
    expect(isLiveTranslationMessage(value)).toBe(liveTranslationMessageSchema.safeParse(value).success);
  });

  it("feed and backlog responses", () => {
    const feeds: unknown[] = [
      { messages: [{ type: "wish", wish }], until: at },
      { messages: [], until: at },
      { messages: [{ type: "bad" }], until: at },
      { messages: [] },
    ];
    for (const f of feeds) expect(isLiveDisplayFeedResponse(f)).toBe(liveDisplayFeedResponseSchema.safeParse(f).success);
    const backlogs: unknown[] = [{ segments: [segment] }, { segments: [] }, { segments: [{}] }, {}];
    for (const b of backlogs) expect(isTranslationBacklog(b)).toBe(translationBacklogResponseSchema.safeParse(b).success);
  });
});
