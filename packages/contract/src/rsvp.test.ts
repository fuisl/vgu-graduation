import { describe, expect, it } from "vitest";
import {
  accessibilitySummarySchema,
  adminAccessibilityResponseSchema,
  getRsvpResponseSchema,
  hasAccessibilityNeeds,
  putRsvpRequestSchema,
  putRsvpResponseSchema,
} from "./rsvp.js";

const uuid = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";
const now = "2026-11-10T02:00:00.000Z";
const rsvp = { id: uuid, attending: true, plusOnesCount: 0, dietaryRequirements: null, notes: null, updatedAt: now };
const noNeeds = {
  wheelchair: false,
  stepFreeAccess: false,
  captions: false,
  seatNearSpeakers: false,
  largePrint: false,
  visionAssistance: false,
  seatNearFront: false,
  aisleSeat: false,
  companion: false,
  note: null,
};

describe("accessibility needs on PUT /rsvp", () => {
  it("is optional, so existing RSVP forms keep working", () => {
    expect(putRsvpRequestSchema.parse({ attending: true }).accessibility).toBeUndefined();
  });

  it("fills unset flags with false and trims the note", () => {
    const parsed = putRsvpRequestSchema.parse({ attending: true, accessibility: { wheelchair: true, note: "  ramp please " } });
    expect(parsed.accessibility).toEqual({ ...noNeeds, wheelchair: true, note: "ramp please" });
  });

  it("accepts null to clear and rejects a note over 500 characters", () => {
    expect(putRsvpRequestSchema.parse({ attending: true, accessibility: null }).accessibility).toBeNull();
    expect(putRsvpRequestSchema.safeParse({ attending: true, accessibility: { note: "x".repeat(501) } }).success).toBe(false);
  });

  it("rejects non-boolean flags", () => {
    expect(putRsvpRequestSchema.safeParse({ attending: true, accessibility: { wheelchair: "yes" } }).success).toBe(false);
  });
});

describe("hasAccessibilityNeeds", () => {
  it("is false for nothing set, true for any flag or a note", () => {
    expect(hasAccessibilityNeeds(null)).toBe(false);
    expect(hasAccessibilityNeeds(noNeeds)).toBe(false);
    expect(hasAccessibilityNeeds({ ...noNeeds, aisleSeat: true })).toBe(true);
    expect(hasAccessibilityNeeds({ ...noNeeds, note: "I use a cane" })).toBe(true);
  });
});

describe("guest and admin reads", () => {
  it("GET /rsvp carries the guest's own needs, or a null rsvp", () => {
    expect(getRsvpResponseSchema.safeParse({ rsvp: { ...rsvp, accessibility: null } }).success).toBe(true);
    expect(getRsvpResponseSchema.safeParse({ rsvp: null }).success).toBe(true);
    expect(getRsvpResponseSchema.safeParse({ rsvp }).success).toBe(false);
  });

  it("the PUT response still parses without accessibility (older fixtures)", () => {
    expect(putRsvpResponseSchema.safeParse(rsvp).success).toBe(true);
  });

  it("the admin summary has a count for every need", () => {
    const needs = Object.fromEntries(Object.keys(noNeeds).filter((k) => k !== "note").map((k) => [k, 0]));
    const summary = { guests: 0, withNote: 0, needs };
    expect(accessibilitySummarySchema.safeParse(summary).success).toBe(true);
    expect(accessibilitySummarySchema.safeParse({ ...summary, needs: { wheelchair: 1 } }).success).toBe(false);
    expect(
      adminAccessibilityResponseSchema.safeParse({
        summary,
        items: [{ invitationId: uuid, guestName: "Jane", attending: true, plusOnesCount: 1, accessibility: noNeeds, updatedAt: now }],
      }).success,
    ).toBe(true);
  });
});
