import type { TranslationSegment, TranslationText } from "@grad/contract";
import { describe, expect, it } from "vitest";
import { backfillAfter, captionFor, lastPosition, mergeSegment, mergeSegments, mergeTranslations } from "./segments";

function seg(sequence: number, translations: TranslationText[] = [], sessionId = "s1"): TranslationSegment {
  return {
    sessionId,
    sequence,
    startMs: sequence * 1_000,
    endMs: sequence * 1_000 + 900,
    sourceLanguage: "en",
    sourceText: `Sentence ${sequence}`,
    translations,
  };
}
const vi = (status: TranslationText["status"], text: string | null = `Câu ${status}`): TranslationText => ({
  language: "vi",
  status,
  text,
  provider: "mock",
});
const keys = (list: TranslationSegment[]) => list.map((s) => `${s.sessionId}:${s.sequence}`);

describe("mergeTranslations", () => {
  it("upgrades draft to final and never downgrades", () => {
    expect(mergeTranslations([vi("draft")], [vi("final")])).toEqual([vi("final")]);
    expect(mergeTranslations([vi("final")], [vi("draft")])).toEqual([vi("final")]);
    expect(mergeTranslations([vi("draft")], [vi("failed", null)])).toEqual([vi("failed", null)]);
    expect(mergeTranslations([vi("final")], [vi("failed", null)])).toEqual([vi("final")]);
  });

  it("keeps other languages untouched", () => {
    const de: TranslationText = { language: "de", status: "final", text: "Satz", provider: "mock" };
    expect(mergeTranslations([de], [vi("draft")])).toEqual([de, vi("draft")]);
  });
});

describe("mergeSegment", () => {
  it("dedupes by session and sequence and merges translations", () => {
    let list = mergeSegment([], seg(0, [vi("draft")]));
    list = mergeSegment(list, seg(0, [vi("final")]));
    list = mergeSegment(list, seg(0, [vi("draft")]));
    expect(list).toHaveLength(1);
    expect(list[0]!.translations).toEqual([vi("final")]);
  });

  it("keeps spoken order when a backfill arrives after live lines", () => {
    const list = mergeSegments([], [seg(5), seg(6), seg(2), seg(4), seg(3)]);
    expect(keys(list)).toEqual(["s1:2", "s1:3", "s1:4", "s1:5", "s1:6"]);
  });

  it("orders sessions by first appearance", () => {
    const list = mergeSegments([], [seg(8, [], "a"), seg(0, [], "b"), seg(7, [], "a"), seg(1, [], "b")]);
    expect(keys(list)).toEqual(["a:7", "a:8", "b:0", "b:1"]);
  });

  it("is bounded", () => {
    const list = mergeSegments([], Array.from({ length: 50 }, (_, i) => seg(i)), 10);
    expect(list).toHaveLength(10);
    expect(list[0]!.sequence).toBe(40);
  });
});

describe("lastPosition", () => {
  it("is the newest sequence of the newest session", () => {
    expect(lastPosition([])).toBeNull();
    expect(lastPosition(mergeSegments([], [seg(3, [], "a"), seg(1, [], "b"), seg(2, [], "b")]))).toEqual({ sessionId: "b", sequence: 2 });
  });
});

describe("backfillAfter", () => {
  it("is null when nothing is missing", () => {
    expect(backfillAfter([], seg(0))).toBeNull();
    expect(backfillAfter([seg(0), seg(1)], seg(2))).toBeNull();
    expect(backfillAfter([seg(0), seg(1)], seg(1))).toBeNull();
  });

  it("asks for the gap after the newest held sequence", () => {
    expect(backfillAfter([seg(0), seg(1)], seg(5))).toBe(1);
  });

  it("fills a bounded window when joining mid-session", () => {
    expect(backfillAfter([], seg(3))).toBe(-1);
    expect(backfillAfter([], seg(500), 50)).toBe(449);
    expect(backfillAfter([seg(10)], seg(500), 50)).toBe(449);
    expect(backfillAfter([seg(0, [], "old")], seg(4, [], "new"))).toBe(-1);
  });
});

describe("captionFor", () => {
  it("shows the spoken language as-is", () => {
    expect(captionFor(seg(1), "en")).toMatchObject({ text: "Sentence 1", language: "en", tone: "final" });
  });

  it("shows drafts and finals in the chosen language", () => {
    expect(captionFor(seg(1, [vi("draft", "nháp")]), "vi")).toMatchObject({ text: "nháp", language: "vi", tone: "draft" });
    expect(captionFor(seg(1, [vi("final", "xong")]), "vi")).toMatchObject({ text: "xong", tone: "final" });
  });

  it("falls back to the source text while pending or failed", () => {
    expect(captionFor(seg(1), "de")).toMatchObject({ text: "Sentence 1", language: "en", tone: "pending" });
    expect(captionFor(seg(1, [vi("failed", null)]), "vi")).toMatchObject({ text: "Sentence 1", language: "en", tone: "failed" });
  });
});
