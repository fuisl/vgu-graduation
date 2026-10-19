import { describe, expect, it } from "vitest";
import {
  createGuideItemRequestSchema,
  guestGuideResponseSchema,
  putInvitationGuideRequestSchema,
  updateGuideItemRequestSchema,
} from "./guide.js";

const uuid = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";

describe("guide-book contract (#140)", () => {
  it("creates an item with defaults", () => {
    expect(createGuideItemRequestSchema.parse({ title: " Library ", category: "explore" })).toEqual({
      title: "Library",
      category: "explore",
      description: "",
      mapUrl: null,
      timeHint: null,
      sortOrder: 0,
      active: true,
    });
  });

  it("only accepts https map links and known categories", () => {
    expect(createGuideItemRequestSchema.safeParse({ title: "Gate", category: "photo-spot", mapUrl: "http://maps.example" }).success).toBe(false);
    expect(createGuideItemRequestSchema.safeParse({ title: "Gate", category: "nightlife" }).success).toBe(false);
  });

  it("updates need at least one field and may clear optional ones", () => {
    expect(updateGuideItemRequestSchema.safeParse({}).success).toBe(false);
    expect(updateGuideItemRequestSchema.parse({ mapUrl: null })).toEqual({ mapUrl: null });
  });

  it("selection is a list of item ids; empty means defaults", () => {
    expect(putInvitationGuideRequestSchema.safeParse({ itemIds: [] }).success).toBe(true);
    expect(putInvitationGuideRequestSchema.safeParse({ itemIds: ["nope"] }).success).toBe(false);
  });

  it("the guest guide says whether it is tailored", () => {
    const item = { id: uuid, title: "Canteen", category: "food-drink", description: "", mapUrl: null, timeHint: null, sortOrder: 1 };
    expect(guestGuideResponseSchema.safeParse({ tailored: false, items: [item] }).success).toBe(true);
  });
});
