import { describe, expect, it } from "vitest";
import {
  createInvitationRequestSchema,
  invitationSchema,
  rotateInvitationResponseSchema,
} from "./invitations.js";

describe("createInvitationRequestSchema", () => {
  it("accepts a minimal valid payload", () => {
    const result = createInvitationRequestSchema.safeParse({
      guestName: "Jane Doe",
      inviterUserIds: ["3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty inviterUserIds array", () => {
    const result = createInvitationRequestSchema.safeParse({
      guestName: "Jane Doe",
      inviterUserIds: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing guestName", () => {
    const result = createInvitationRequestSchema.safeParse({
      inviterUserIds: ["3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f"],
    });
    expect(result.success).toBe(false);
  });
});

describe("invitationSchema", () => {
  it("accepts a full invitation with no rsvp yet", () => {
    const result = invitationSchema.safeParse({
      id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
      guest: {
        id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70",
        name: "Jane Doe",
        email: "jane@example.com",
        phone: null,
      },
      maxPlusOnes: 1,
      status: "active",
      validFrom: null,
      validUntil: null,
      inviters: [],
      rsvp: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid status", () => {
    const result = invitationSchema.safeParse({
      id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
      guest: {
        id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70",
        name: "Jane Doe",
        email: null,
        phone: null,
      },
      maxPlusOnes: 0,
      status: "pending",
      validFrom: null,
      validUntil: null,
      inviters: [],
      rsvp: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("rotateInvitationResponseSchema", () => {
  it("rejects a non-URL inviteUrl", () => {
    const result = rotateInvitationResponseSchema.safeParse({
      token: "abc123",
      inviteUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});
