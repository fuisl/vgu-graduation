import { describe, expect, it } from "vitest";
import type { Invitation } from "@grad/contract";
import { selectInvitePageState } from "./state";
import { empty, errorResult, ok } from "../api/result";

const invitation: Invitation = {
  id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
  guest: { id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70", name: "Jane Doe", email: null, phone: null },
  maxPlusOnes: 1,
  status: "active",
  validFrom: null,
  validUntil: null,
  inviters: [],
  rsvp: null,
};

describe("selectInvitePageState", () => {
  it("no cookie -> invalid", () => {
    expect(selectInvitePageState(null)).toEqual({ kind: "invalid" });
  });
  it("active invitation -> personal", () => {
    expect(selectInvitePageState(ok(invitation))).toEqual({ kind: "personal", invitation });
  });
  it("revoked invitation payload -> invalid, never personal", () => {
    expect(selectInvitePageState(ok({ ...invitation, status: "revoked" }))).toEqual({ kind: "invalid" });
  });
  it("404/401 (empty) -> invalid", () => {
    expect(selectInvitePageState(empty())).toEqual({ kind: "invalid" });
  });
  it("410 -> expired", () => {
    expect(selectInvitePageState(errorResult("http", "gone", 410))).toEqual({ kind: "expired" });
  });
  it("other http errors, network and validation -> error", () => {
    expect(selectInvitePageState(errorResult("http", "x", 500))).toEqual({ kind: "error" });
    expect(selectInvitePageState(errorResult("network", "x"))).toEqual({ kind: "error" });
    expect(selectInvitePageState(errorResult("validation", "x"))).toEqual({ kind: "error" });
  });
});
