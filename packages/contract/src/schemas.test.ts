import { describe, expect, it } from "vitest";
import {
  adminOverviewSchema,
  adminWishSchema,
  completePrintJobRequestSchema,
  createPrintJobRequestSchema,
  createWishRequestSchema,
  eventSchema,
  ingestTranslationSegmentRequestSchema,
  liveDisplayFeedQuerySchema,
  liveDisplayFeedResponseSchema,
  liveDisplayMessageSchema,
  liveTranslationMessageSchema,
  mediaVariantParamsSchema,
  moderateRequestSchema,
  nextPrintJobResponseSchema,
  pageQuerySchema,
  passPayloadSchema,
  passResponseSchema,
  putRsvpRequestSchema,
  translationBacklogQuerySchema,
  translationTextSchema,
  uploadMediaResponseSchema,
} from "./index.js";

const uuid = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";
const now = "2026-11-10T02:00:00.000Z";

describe("rsvp", () => {
  it("defaults plus-ones to 0 and accepts null optional notes", () => {
    const parsed = putRsvpRequestSchema.parse({ attending: true, notes: null });
    expect(parsed.plusOnesCount).toBe(0);
  });

  it("rejects negative plus-ones and non-boolean attending", () => {
    expect(putRsvpRequestSchema.safeParse({ attending: true, plusOnesCount: -1 }).success).toBe(false);
    expect(putRsvpRequestSchema.safeParse({ attending: "yes" }).success).toBe(false);
  });
});

describe("event", () => {
  const event = {
    name: "VGU Graduation 2026",
    startsAt: "2026-11-15T02:00:00+07:00",
    endsAt: null,
    timeZone: "Asia/Ho_Chi_Minh",
    timeConfirmed: false,
    venue: { name: "Ceremony Hall", address: "VGU Campus, HCMC", mapUrl: "https://maps.app.goo.gl/meCAgQyakBbWh8LDA" },
    contact: null,
    arrivalInfo: null,
  };

  it("accepts a placeholder event with unconfirmed time", () => {
    expect(eventSchema.safeParse(event).success).toBe(true);
  });

  it("rejects a non-URL map link and a timestamp without an offset", () => {
    expect(eventSchema.safeParse({ ...event, venue: { ...event.venue, mapUrl: "somewhere" } }).success).toBe(false);
    expect(eventSchema.safeParse({ ...event, startsAt: "2026-11-15T09:00:00" }).success).toBe(false);
  });
});

describe("pass", () => {
  const payload = { v: 1, invitationId: uuid, guestName: "Jane", validFrom: null, validUntil: now };

  it("accepts a versioned payload and rejects unknown versions", () => {
    expect(passPayloadSchema.safeParse(payload).success).toBe(true);
    expect(passPayloadSchema.safeParse({ ...payload, v: 2 }).success).toBe(false);
  });

  it("strips fields that must never enter the QR code", () => {
    const parsed = passPayloadSchema.parse({ ...payload, email: "jane@example.com", token: "secret" });
    expect(parsed).not.toHaveProperty("email");
    expect(parsed).not.toHaveProperty("token");
  });

  it("requires a signature and key id", () => {
    expect(passResponseSchema.safeParse({ payload, signature: "", keyId: "k1" }).success).toBe(false);
    expect(passResponseSchema.safeParse({ payload, signature: "abc", keyId: "k1" }).success).toBe(true);
  });
});

describe("media, wishes and moderation", () => {
  it("only knows the thumb and display variants", () => {
    expect(mediaVariantParamsSchema.safeParse({ id: "abc", variant: "display" }).success).toBe(true);
    expect(mediaVariantParamsSchema.safeParse({ id: "abc", variant: "original" }).success).toBe(false);
  });

  it("upload response carries the shots left on the roll", () => {
    const ok = { publicId: "EMV5xWTOra4aOngA9GnNdQ", processingStatus: "pending", shotsRemaining: 0 };
    expect(uploadMediaResponseSchema.safeParse(ok).success).toBe(true);
    expect(uploadMediaResponseSchema.safeParse({ ...ok, shotsRemaining: -1 }).success).toBe(false);
    expect(uploadMediaResponseSchema.safeParse({ publicId: ok.publicId, processingStatus: "pending" }).success).toBe(false);
  });

  it("moderation accepts only visible, hidden and removed", () => {
    expect(moderateRequestSchema.safeParse({ status: "hidden" }).success).toBe(true);
    expect(moderateRequestSchema.safeParse({ status: "approved" }).success).toBe(false);
  });

  it("trims wishes and enforces the 1000 character limit", () => {
    expect(createWishRequestSchema.parse({ body: "  Congrats!  " }).body).toBe("Congrats!");
    expect(createWishRequestSchema.safeParse({ body: "   " }).success).toBe(false);
    expect(createWishRequestSchema.safeParse({ body: "x".repeat(1001) }).success).toBe(false);
  });

  it("admin wishes carry their moderation state", () => {
    const wish = { id: uuid, authorName: "Jane", body: "Congrats!", createdAt: now };
    expect(adminWishSchema.safeParse({ ...wish, status: "hidden" }).success).toBe(true);
    expect(adminWishSchema.safeParse(wish).success).toBe(false);
  });

  it("coerces and bounds pagination from query strings", () => {
    expect(pageQuerySchema.parse({}).limit).toBe(50);
    expect(pageQuerySchema.parse({ limit: "20" }).limit).toBe(20);
    expect(pageQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
  });
});

describe("translation", () => {
  const segment = {
    sessionId: "ceremony-1",
    sequence: 0,
    startMs: 0,
    endMs: 3200,
    sourceLanguage: "vi",
    sourceText: "Xin chào quý vị",
    translations: [
      { language: "en", status: "final", text: "Hello everyone", provider: "local-gpu" },
      { language: "de", status: "failed", text: null, provider: null },
    ],
  };

  it("accepts a segment with a mix of final and failed translations", () => {
    expect(ingestTranslationSegmentRequestSchema.safeParse(segment).success).toBe(true);
  });

  it("only accepts en/vi speech and de/en/vi captions", () => {
    expect(ingestTranslationSegmentRequestSchema.safeParse({ ...segment, sourceLanguage: "de" }).success).toBe(false);
    expect(translationTextSchema.safeParse({ language: "fr", status: "final", text: "x", provider: null }).success).toBe(false);
  });

  it("requires text unless the translation failed", () => {
    expect(translationTextSchema.safeParse({ language: "en", status: "draft", text: null, provider: null }).success).toBe(false);
    expect(translationTextSchema.safeParse({ language: "en", status: "failed", text: null, provider: null }).success).toBe(true);
  });

  it("rejects a segment that ends before it starts", () => {
    expect(ingestTranslationSegmentRequestSchema.safeParse({ ...segment, startMs: 5000 }).success).toBe(false);
  });

  it("defaults the backlog cursor to before the first segment", () => {
    expect(translationBacklogQuerySchema.parse({ sessionId: "s" }).after).toBe(-1);
  });

  it("carries segments and availability on the live socket", () => {
    expect(liveTranslationMessageSchema.safeParse({ type: "segment", segment }).success).toBe(true);
    expect(liveTranslationMessageSchema.safeParse({ type: "status", state: "unavailable" }).success).toBe(true);
    expect(liveTranslationMessageSchema.safeParse({ type: "status", state: "on fire" }).success).toBe(false);
  });
});

describe("live display", () => {
  it("discriminates on type and lets the kiosk drop hidden items", () => {
    const wish = { id: uuid, authorName: "Jane", body: "Congrats!", createdAt: now };
    expect(liveDisplayMessageSchema.safeParse({ type: "wish", wish }).success).toBe(true);
    expect(liveDisplayMessageSchema.safeParse({ type: "hidden", kind: "wish", id: uuid }).success).toBe(true);
    expect(liveDisplayMessageSchema.safeParse({ type: "wish", photo: {} }).success).toBe(false);
  });

  it("carries a keepalive cursor and a catch-up page", () => {
    expect(liveDisplayMessageSchema.safeParse({ type: "keepalive", until: now }).success).toBe(true);
    expect(liveDisplayFeedQuerySchema.safeParse({ since: "yesterday" }).success).toBe(false);
    expect(liveDisplayFeedQuerySchema.parse({}).since).toBeUndefined();
    const hidden = { type: "hidden", kind: "photo", id: "p1" };
    expect(liveDisplayFeedResponseSchema.safeParse({ messages: [hidden], until: now }).success).toBe(true);
  });
});

describe("print", () => {
  it("defaults to one copy and caps copies", () => {
    expect(createPrintJobRequestSchema.parse({ photoPublicId: "abc" }).copies).toBe(1);
    expect(createPrintJobRequestSchema.safeParse({ photoPublicId: "abc", copies: 20 }).success).toBe(false);
  });

  it("allows an empty queue and a completion report", () => {
    expect(nextPrintJobResponseSchema.safeParse({ job: null }).success).toBe(true);
    expect(completePrintJobRequestSchema.safeParse({ result: "failed", error: "paper jam" }).success).toBe(true);
    expect(completePrintJobRequestSchema.safeParse({ result: "queued" }).success).toBe(false);
  });
});

describe("admin overview", () => {
  it("accepts aggregate counts and rejects negatives", () => {
    const overview = {
      invitations: { total: 10, active: 9, revoked: 1 },
      rsvp: { attending: 5, declined: 1, pending: 4, plusOnes: 3 },
      photos: { visible: 2, hidden: 0, removed: 0, pending: 1 },
      wishes: { visible: 4, hidden: 0, removed: 0 },
      jobs: { queued: 0, failed: 0 },
    };
    expect(adminOverviewSchema.safeParse(overview).success).toBe(true);
    expect(adminOverviewSchema.safeParse({ ...overview, jobs: { queued: -1, failed: 0 } }).success).toBe(false);
  });
});

describe("wave 0 admin schemas", () => {
  it("normalizes graduate emails and rejects blanks", async () => {
    const { createGraduateRequestSchema } = await import("./index.js");
    expect(createGraduateRequestSchema.parse({ name: " Lan ", email: " Lan@Example.com " })).toEqual({
      name: "Lan",
      email: "lan@example.com",
    });
    expect(createGraduateRequestSchema.safeParse({ name: "", email: "x@example.com" }).success).toBe(false);
  });

  it("rejects an event that ends before it starts", async () => {
    const { updateEventRequestSchema } = await import("./index.js");
    const event = {
      name: "GRAD '26",
      startsAt: "2026-11-14T09:00:00+07:00",
      endsAt: "2026-11-14T08:00:00+07:00",
      timeZone: "Asia/Ho_Chi_Minh",
      timeConfirmed: false,
      venue: { name: "Ceremony Hall", address: "VGU", mapUrl: "https://maps.app.goo.gl/meCAgQyakBbWh8LDA" },
      contact: null,
      arrivalInfo: null,
    };
    expect(updateEventRequestSchema.safeParse(event).success).toBe(false);
    expect(updateEventRequestSchema.safeParse({ ...event, endsAt: null }).success).toBe(true);
  });

  it("admin invitation rows never carry a token", async () => {
    const { adminInvitationRowSchema } = await import("./index.js");
    const row = adminInvitationRowSchema.parse({
      id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
      guest: { id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70", name: "Jane", email: null, phone: null },
      status: "active",
      maxPlusOnes: 0,
      inviters: [],
      rsvp: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      token: "leak",
      tokenHash: "leak",
    });
    expect(JSON.stringify(row)).not.toContain("leak");
  });
});
