import type { AdminInvitationRow } from "@grad/contract";
import { describe, expect, it } from "vitest";
import { computeAdminCounts, describeRsvp } from "./overview";

let n = 0;
function row(status: "active" | "revoked", rsvp: { attending: boolean; plusOnesCount: number } | null): AdminInvitationRow {
  n += 1;
  const id = `3f2e8b1a-9c3d-4c9a-8b1e-${String(n).padStart(12, "0")}`;
  return {
    id,
    guest: { id, name: `Guest ${n}`, email: null, phone: null },
    status,
    maxPlusOnes: 2,
    inviters: [],
    rsvp: rsvp
      ? { id, ...rsvp, dietaryRequirements: null, notes: null, updatedAt: "2026-09-30T00:00:00.000Z" }
      : null,
    createdAt: "2026-09-30T00:00:00.000Z",
  };
}

describe("computeAdminCounts", () => {
  it("is all zeros for no invitations", () => {
    expect(computeAdminCounts([])).toEqual({
      invitations: { total: 0, active: 0, revoked: 0 },
      rsvp: { attending: 0, declined: 0, pending: 0, plusOnes: 0 },
    });
  });

  it("counts statuses and answers, ignoring answers on revoked invitations", () => {
    const counts = computeAdminCounts([
      row("active", { attending: true, plusOnesCount: 2 }),
      row("active", { attending: true, plusOnesCount: 1 }),
      row("active", { attending: false, plusOnesCount: 0 }),
      row("active", null),
      row("revoked", { attending: true, plusOnesCount: 2 }),
      row("revoked", null),
    ]);

    expect(counts).toEqual({
      invitations: { total: 6, active: 4, revoked: 2 },
      rsvp: { attending: 2, declined: 1, pending: 1, plusOnes: 3 },
    });
  });
});

describe("describeRsvp", () => {
  it("summarises each answer", () => {
    expect(describeRsvp(null, 2)).toBe("No answer");
    expect(describeRsvp({ attending: false, plusOnesCount: 0 }, 2)).toBe("Declined");
    expect(describeRsvp({ attending: true, plusOnesCount: 1 }, 2)).toBe("Attending +1 of 2");
    expect(describeRsvp({ attending: true, plusOnesCount: 0 }, 0)).toBe("Attending");
  });
});
