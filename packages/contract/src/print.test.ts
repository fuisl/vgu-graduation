import { describe, expect, it } from "vitest";
import {
  adminPrintJobSchema,
  adminPrintJobsQuerySchema,
  adminPrintJobsResponseSchema,
  claimedPrintJobSchema,
  createPrintJobRequestSchema,
  nextPrintJobResponseSchema,
  printJobSchema,
  printOptionsSchema,
} from "./print.js";

const uuid = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";
const now = "2026-11-10T02:00:00.000Z";
const job = { id: uuid, photoPublicId: "abc", copies: 1, status: "printing", createdAt: now };

describe("print queue contract", () => {
  it("hands the daemon a fetch URL and lease, additively over printJobSchema", () => {
    const claimed = { ...job, imageUrl: "https://api.example.test/media/abc/display", variant: "display", attempt: 1, leaseExpiresAt: now };
    expect(nextPrintJobResponseSchema.safeParse({ job: claimed }).success).toBe(true);
    // A daemon written against the original shape still parses the claim.
    expect(printJobSchema.safeParse(claimed).success).toBe(true);
    expect(claimedPrintJobSchema.safeParse(job).success).toBe(false);
  });

  it("admin jobs carry who asked, attempts and the reported error", () => {
    const row = { ...job, requestedBy: "guest", attempts: 2, error: "paper jam", leaseExpiresAt: null, completedAt: null, updatedAt: now };
    expect(adminPrintJobSchema.safeParse(row).success).toBe(true);
    expect(
      adminPrintJobsResponseSchema.safeParse({ items: [row], nextCursor: null, counts: { queued: 0, printing: 1, done: 0, failed: 0 } })
        .success,
    ).toBe(true);
  });

  it("filters the admin listing by status", () => {
    expect(adminPrintJobsQuerySchema.parse({ status: "failed", limit: "10" })).toEqual({ status: "failed", limit: 10 });
    expect(adminPrintJobsQuerySchema.safeParse({ status: "lost" }).success).toBe(false);
  });

  it("print options: layouts from the photobooth, ascii, a short single-line caption", () => {
    expect(printOptionsSchema.parse({ layout: "boarding", ascii: true, caption: "  Class of 2026  " })).toEqual({
      layout: "boarding",
      ascii: true,
      caption: "Class of 2026",
    });
    expect(printOptionsSchema.parse({})).toEqual({});
    expect(printOptionsSchema.safeParse({ layout: "poster" }).success).toBe(false);
    expect(printOptionsSchema.safeParse({ caption: "x".repeat(61) }).success).toBe(false);
    expect(printOptionsSchema.safeParse({ caption: "two\nlines" }).success).toBe(false);
  });

  it("requests and claims carry options optionally, so older clients and APIs still parse", () => {
    expect(createPrintJobRequestSchema.parse({ photoPublicId: "abc" })).toEqual({ photoPublicId: "abc", copies: 1 });
    expect(createPrintJobRequestSchema.parse({ photoPublicId: "abc", options: { layout: "strip" } }).options).toEqual({ layout: "strip" });
    const claimed = { ...job, imageUrl: "https://api.example.test/media/abc/display", variant: "display", attempt: 1, leaseExpiresAt: now };
    expect(claimedPrintJobSchema.parse(claimed).options).toBeUndefined();
    expect(claimedPrintJobSchema.parse({ ...claimed, options: null }).options).toBeNull();
    expect(claimedPrintJobSchema.parse({ ...claimed, options: { ascii: true } }).options).toEqual({ ascii: true });
  });
});
