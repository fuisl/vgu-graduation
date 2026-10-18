import { describe, expect, it } from "vitest";
import {
  AnnouncementQueue,
  defaultLanguage,
  parseSegmentsPage,
  parseLanguage,
  parseTextSize,
  parseTranslationMessage,
  safeStorage,
  segmentsUrl,
  translationView,
} from "./translation-feed";

describe("parsing", () => {
  it("accepts contract messages only", () => {
    expect(parseTranslationMessage('{"type":"status","state":"unavailable"}')).toEqual({ type: "status", state: "unavailable" });
    expect(parseTranslationMessage('{"type":"status","state":"maybe"}')).toBeNull();
    expect(parseTranslationMessage("{")).toBeNull();
    expect(parseTranslationMessage('{"type":"keepalive","until":"2026-10-24T09:00:00.000Z"}')).toMatchObject({ type: "keepalive" });
    const page = { segments: [], until: "2026-10-24T09:00:00.000Z", more: false, state: "live" };
    expect(parseSegmentsPage(page)).toEqual(page);
    expect(parseSegmentsPage({ segments: [] })).toBeNull();
  });

  it("builds the catch-up URL from the contract query", () => {
    expect(segmentsUrl("https://api.example.test", null)).toBe("https://api.example.test/live/translation/segments?limit=200");
    expect(segmentsUrl("https://api.example.test", "2026-10-24T09:00:00.000+07:00", 50)).toBe(
      "https://api.example.test/live/translation/segments?since=2026-10-24T09%3A00%3A00.000%2B07%3A00&limit=50",
    );
  });
});

describe("translationView", () => {
  const connecting = (failures: number, everOpened = false) => ({ phase: "connecting" as const, failures, everOpened });
  const waiting = (failures: number, everOpened = false) => ({ phase: "waiting" as const, failures, everOpened, retryInMs: 1 });

  it("is live when open, unless the API says the service is away", () => {
    expect(translationView({ phase: "open" }, "unknown")).toBe("live");
    expect(translationView({ phase: "open" }, "live")).toBe("live");
    expect(translationView({ phase: "open" }, "unavailable")).toBe("unavailable");
  });

  it("says connecting at first and unavailable once the socket keeps failing", () => {
    expect(translationView(connecting(0), "unknown")).toBe("connecting");
    expect(translationView(waiting(2), "unknown")).toBe("connecting");
    expect(translationView(waiting(3), "unknown")).toBe("unavailable");
  });

  it("follows the server state while polling over HTTP (socket refused at capacity)", () => {
    expect(translationView(waiting(5), "live", true)).toBe("live");
    expect(translationView(waiting(5), "unavailable", true)).toBe("unavailable");
    expect(translationView(waiting(1), "unknown", true)).toBe("connecting");
  });

  it("says reconnecting after a drop, for a while", () => {
    expect(translationView(waiting(1, true), "live")).toBe("reconnecting");
    expect(translationView(waiting(6, true), "live")).toBe("unavailable");
    expect(translationView(waiting(1, true), "unavailable")).toBe("unavailable");
  });
});

describe("preferences", () => {
  it("picks the first supported browser language", () => {
    expect(defaultLanguage(["fr-FR", "de-AT", "en"])).toBe("de");
    expect(defaultLanguage(["vi"])).toBe("vi");
    expect(defaultLanguage(["fr"])).toBe("en");
    expect(defaultLanguage([])).toBe("en");
  });

  it("validates stored values", () => {
    expect(parseLanguage("vi")).toBe("vi");
    expect(parseLanguage("fr")).toBeNull();
    expect(parseLanguage(null)).toBeNull();
    expect(parseTextSize("xl")).toBe("xl");
    expect(parseTextSize("huge")).toBeNull();
  });

  it("never throws when storage is blocked", () => {
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      },
    });
    expect(safeStorage.get("x")).toBeNull();
    expect(() => safeStorage.set("x", "y")).not.toThrow();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: original });
  });
});

describe("AnnouncementQueue", () => {
  it("throttles and batches announcements", () => {
    const q = new AnnouncementQueue(5_000, 100);
    expect(q.take(0)).toBeNull();
    q.push("a", "One.");
    expect(q.take(0)).toBe("One.");
    q.push("b", "Two.");
    q.push("c", "Three.");
    expect(q.take(4_999)).toBeNull();
    expect(q.waitMs(4_000)).toBe(1_000);
    expect(q.take(5_000)).toBe("Two. Three.");
  });

  it("announces each segment once and keeps the newest text within the cap", () => {
    const q = new AnnouncementQueue(0, 12);
    q.push("a", "Alpha");
    q.take(0);
    q.push("a", "Alpha");
    expect(q.hasPending).toBe(false);
    q.push("b", "Bravo");
    q.push("c", "Charlie");
    q.push("d", "Delta");
    expect(q.take(1)).toBe("Delta");
  });

  it("always says something when a single line is longer than the cap", () => {
    const q = new AnnouncementQueue(0, 5);
    q.push("a", "A long sentence");
    expect(q.take(0)).toBe("A long sentence");
  });

  it("keeps its memory bounded", () => {
    const q = new AnnouncementQueue(0, 1_000, 10);
    for (let i = 0; i < 1_000; i += 1) {
      q.push(String(i), "x");
      q.take(i);
    }
    expect((q as unknown as { announced: Set<string> }).announced.size).toBeLessThanOrEqual(10);
  });
});
