import { describe, expect, it } from "vitest";
import { GUEST_LINKS, selectGuestPageState } from "./state";

const invitation = {
  id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
  guest: { id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70", name: "Linh Tran", givenName: "Linh", email: null, phone: null },
  maxPlusOnes: 0,
  status: "active" as const,
  validFrom: null,
  validUntil: null,
  inviters: [],
  rsvp: null,
};

describe("selectGuestPageState", () => {
  it("is signed out without a cookie, whatever else", () => {
    expect(selectGuestPageState(false, null)).toEqual({ kind: "signed-out" });
  });

  it("is personal for an active invitation", () => {
    expect(selectGuestPageState(true, { status: "ok", data: invitation })).toEqual({ kind: "personal", invitation });
  });

  it("follows the invitation page for invalid, revoked, expired and errors", () => {
    expect(selectGuestPageState(true, { status: "empty" })).toEqual({ kind: "invalid" });
    expect(selectGuestPageState(true, { status: "ok", data: { ...invitation, status: "revoked" } })).toEqual({ kind: "invalid" });
    expect(selectGuestPageState(true, { status: "error", kind: "http", message: "gone", httpStatus: 410 })).toEqual({ kind: "expired" });
    expect(selectGuestPageState(true, { status: "error", kind: "network", message: "down" })).toEqual({ kind: "error" });
  });
});

describe("GUEST_LINKS", () => {
  it("lists only the guest's own pages that the site menu does not", () => {
    expect(GUEST_LINKS.map((link) => link.href)).toEqual(["/guide"]);
  });
});
