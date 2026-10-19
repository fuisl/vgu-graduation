import { describe, expect, it } from "vitest";
import {
  adminMediaItemSchema,
  adminMediaQuerySchema,
  adminWishesQuerySchema,
  CACHE_TAGS,
  cacheTagSchema,
  moderateMediaResponseSchema,
  queryBooleanSchema,
  setMediaPublicResponseSchema,
  setPublicRequestSchema,
  setWishPublicResponseSchema,
} from "./index.js";

const uuid = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";
const now = "2026-11-10T02:00:00.000Z";

describe("cache tags", () => {
  it("lists every tag the web app uses for public listings", () => {
    expect(Object.values(CACHE_TAGS).every((tag) => cacheTagSchema.safeParse(tag).success)).toBe(true);
    expect(cacheTagSchema.safeParse("invitation:abc").success).toBe(false);
  });
});

describe("query booleans", () => {
  it("reads true/false and 1/0, never coerces arbitrary strings", () => {
    expect(queryBooleanSchema.parse("false")).toBe(false);
    expect(queryBooleanSchema.parse("1")).toBe(true);
    expect(queryBooleanSchema.safeParse("yes").success).toBe(false);
  });
});

describe("admin moderation queue (#64)", () => {
  it("filters media by status, processing state and public flag", () => {
    expect(adminMediaQuerySchema.parse({ status: "hidden", processing: "ready", isPublic: "false" })).toEqual({
      limit: 50,
      status: "hidden",
      processing: "ready",
      isPublic: false,
    });
    expect(adminMediaQuerySchema.safeParse({ status: "pending" }).success).toBe(false);
  });

  it("filters wishes by status and public flag", () => {
    expect(adminWishesQuerySchema.parse({ status: "removed", isPublic: "true" })).toMatchObject({ status: "removed", isPublic: true });
  });

  it("admin media items carry state, flag and uploader invitation", () => {
    const item = {
      publicId: "abc",
      width: 640,
      height: 480,
      createdAt: now,
      updatedAt: now,
      status: "hidden",
      processingStatus: "ready",
      isPublic: false,
      invitationId: uuid,
    };
    expect(adminMediaItemSchema.safeParse(item).success).toBe(true);
    expect(adminMediaItemSchema.safeParse({ ...item, isPublic: undefined }).success).toBe(false);
  });

  it("moderation answers name the tags to revalidate", () => {
    const ok = { publicId: "abc", status: "hidden", isPublic: true, revalidateTags: [CACHE_TAGS.gallery, CACHE_TAGS.publicGallery] };
    expect(moderateMediaResponseSchema.safeParse(ok).success).toBe(true);
    expect(moderateMediaResponseSchema.safeParse({ ...ok, revalidateTags: ["nope"] }).success).toBe(false);
  });
});

describe("curated public gallery (#75)", () => {
  it("takes a strict boolean flag", () => {
    expect(setPublicRequestSchema.safeParse({ isPublic: true }).success).toBe(true);
    expect(setPublicRequestSchema.safeParse({ isPublic: "true" }).success).toBe(false);
  });

  it("answers with the flag and the public tag", () => {
    expect(
      setMediaPublicResponseSchema.safeParse({ publicId: "abc", status: "visible", isPublic: true, revalidateTags: [CACHE_TAGS.publicGallery] })
        .success,
    ).toBe(true);
    expect(
      setWishPublicResponseSchema.safeParse({ id: uuid, status: "visible", isPublic: false, revalidateTags: [CACHE_TAGS.publicWishes] }).success,
    ).toBe(true);
  });
});
