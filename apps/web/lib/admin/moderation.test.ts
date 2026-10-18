import { describe, expect, it } from "vitest";
import {
  appendPage,
  canFlagPublic,
  canPrint,
  mediaFilterQuery,
  parseQueueView,
  patchItem,
  queueHref,
  queueKeyCommand,
  wishFilterQuery,
} from "./moderation";

describe("queue views", () => {
  it("parses kind and filter, falling back to the newest photos", () => {
    expect(parseQueueView({})).toEqual({ kind: "photos", filter: "latest" });
    expect(parseQueueView({ kind: "wishes", filter: "hidden" })).toEqual({ kind: "wishes", filter: "hidden" });
    expect(parseQueueView({ kind: "wishes", filter: "processing" })).toEqual({ kind: "wishes", filter: "latest" });
    expect(parseQueueView({ kind: ["photos", "x"], filter: "nonsense" })).toEqual({ kind: "photos", filter: "latest" });
  });

  it("builds links that round-trip", () => {
    expect(queueHref({ kind: "photos", filter: "latest" })).toBe("/admin/moderation?kind=photos");
    const href = queueHref({ kind: "wishes", filter: "public" });
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseQueueView(params)).toEqual({ kind: "wishes", filter: "public" });
  });

  it("maps filters to API queries", () => {
    expect(mediaFilterQuery("latest")).toEqual({});
    expect(mediaFilterQuery("processing")).toEqual({ processing: "pending" });
    expect(mediaFilterQuery("public")).toEqual({ status: "visible", isPublic: true });
    expect(mediaFilterQuery("removed")).toEqual({ status: "removed" });
    expect(wishFilterQuery("hidden")).toEqual({ status: "hidden" });
    expect(wishFilterQuery("processing")).toEqual({});
  });
});

describe("eligibility", () => {
  it("only visible, processed items can be flagged public or printed", () => {
    expect(canFlagPublic({ status: "visible", isPublic: false, processingStatus: "ready" })).toBe(true);
    expect(canFlagPublic({ status: "visible", isPublic: false, processingStatus: "pending" })).toBe(false);
    expect(canFlagPublic({ status: "hidden", isPublic: false })).toBe(false);
    expect(canFlagPublic({ status: "visible", isPublic: false })).toBe(true);
    expect(canPrint({ status: "visible", processingStatus: "ready" })).toBe(true);
    expect(canPrint({ status: "visible", processingStatus: "failed" })).toBe(false);
    expect(canPrint({ status: "removed", processingStatus: "ready" })).toBe(false);
  });
});

describe("optimistic list updates", () => {
  const items = [
    { id: "a", status: "visible" as const, isPublic: false },
    { id: "b", status: "visible" as const, isPublic: true },
  ];
  const idOf = (item: { id: string }) => item.id;

  it("patches one item and can roll it back exactly", () => {
    const hidden = patchItem(items, "b", idOf, { status: "hidden" });
    expect(hidden).toEqual([items[0], { id: "b", status: "hidden", isPublic: true }]);
    expect(patchItem(hidden, "b", idOf, { status: "visible", isPublic: true })).toEqual(items);
  });

  it("appends a page without duplicating items already listed", () => {
    expect(appendPage(items, [items[1], { id: "c", status: "hidden", isPublic: false }], idOf).map(idOf)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("keyboard shortcuts", () => {
  const key = (k: string, extra: Partial<Parameters<typeof queueKeyCommand>[0]> = {}) =>
    queueKeyCommand({ key: k, altKey: false, ctrlKey: false, metaKey: false, targetTag: "LI", ...extra });

  it("maps J/K, V/H/R and P", () => {
    expect(key("j")).toEqual({ type: "move", by: 1 });
    expect(key("ArrowUp")).toEqual({ type: "move", by: -1 });
    expect(key("V")).toEqual({ type: "moderate", status: "visible" });
    expect(key("h")).toEqual({ type: "moderate", status: "hidden" });
    expect(key("r")).toEqual({ type: "moderate", status: "removed" });
    expect(key("p")).toEqual({ type: "public" });
    expect(key("x")).toBeNull();
  });

  it("ignores modified keys and keys typed into form fields", () => {
    expect(key("r", { metaKey: true })).toBeNull();
    expect(key("r", { ctrlKey: true })).toBeNull();
    expect(key("h", { targetTag: "INPUT" })).toBeNull();
    expect(key("j", { targetTag: "textarea" })).toBeNull();
  });
});
