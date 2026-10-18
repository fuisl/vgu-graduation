import { ACCESSIBILITY_NEED_KEYS } from "@grad/contract";
import { describe, expect, it } from "vitest";
import { ACCESSIBILITY_GROUPS, NO_NEEDS, countNeeds, savedNeedsFrom } from "./accessibility";

describe("ACCESSIBILITY_GROUPS", () => {
  it("lists every contract need exactly once", () => {
    const keys = ACCESSIBILITY_GROUPS.flatMap((group) => group.needs.map((need) => need.key));
    expect([...keys].sort()).toEqual([...ACCESSIBILITY_NEED_KEYS].sort());
  });
});

describe("savedNeedsFrom", () => {
  const rsvp = {
    id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
    attending: true,
    plusOnesCount: 0,
    dietaryRequirements: null,
    notes: null,
    updatedAt: "2026-10-01T00:00:00.000Z",
  };

  it("prefills stored needs, or none before an RSVP or without needs", () => {
    const needs = { ...NO_NEEDS, captions: true };
    expect(savedNeedsFrom({ status: "ok", data: { ...rsvp, accessibility: needs } })).toEqual({ status: "ok", needs });
    expect(savedNeedsFrom({ status: "ok", data: { ...rsvp, accessibility: null } })).toEqual({ status: "ok", needs: null });
    expect(savedNeedsFrom({ status: "ok", data: null })).toEqual({ status: "ok", needs: null });
  });

  it("is unavailable when GET /rsvp could not be read", () => {
    expect(savedNeedsFrom(null)).toEqual({ status: "unavailable" });
    expect(savedNeedsFrom({ status: "empty" })).toEqual({ status: "unavailable" });
    expect(savedNeedsFrom({ status: "error", kind: "network", message: "down" })).toEqual({ status: "unavailable" });
  });
});

describe("countNeeds", () => {
  it("counts ticked needs and the note", () => {
    expect(countNeeds(null)).toBe(0);
    expect(countNeeds(NO_NEEDS)).toBe(0);
    expect(countNeeds({ ...NO_NEEDS, wheelchair: true, captions: true })).toBe(2);
    expect(countNeeds({ ...NO_NEEDS, note: "Arriving late" })).toBe(1);
  });
});
