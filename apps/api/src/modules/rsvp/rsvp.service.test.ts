import { describe, expect, it, vi } from "vitest";
import type { ResolveResult } from "../invitations/invitations.service.js";
import type { StoredRsvp, StoredRsvpRow } from "./rsvp.repository.js";
import { RsvpService } from "./rsvp.service.js";

const INVITATION_ID = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";
const stored: StoredRsvp = {
  id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e71",
  attending: true,
  plusOnesCount: 1,
  dietaryRequirements: null,
  notes: null,
  updatedAt: new Date("2026-10-01T00:00:00.000Z"),
};

function setup(resolved: ResolveResult, rows: StoredRsvpRow[] = []) {
  const upsert = vi.fn(async () => stored);
  const listAll = vi.fn(async () => rows);
  const service = new RsvpService({ resolveByToken: async () => resolved }, { upsert, listAll });
  return { service, upsert, listAll };
}

const okInvitation = (maxPlusOnes: number): ResolveResult => ({
  status: "ok",
  invitation: {
    id: INVITATION_ID,
    guest: { id: INVITATION_ID, name: "Jane", email: null, phone: null },
    maxPlusOnes,
    status: "active",
    validFrom: null,
    validUntil: null,
    inviters: [],
    rsvp: null,
  },
});

describe("RsvpService.putByToken", () => {
  it("upserts for the resolved invitation and serializes the date", async () => {
    const { service, upsert } = setup(okInvitation(1));
    const dto = { attending: true, plusOnesCount: 1 };
    const result = await service.putByToken("t", dto);
    expect(upsert).toHaveBeenCalledWith(INVITATION_ID, dto);
    expect(result).toEqual({ status: "ok", rsvp: { ...stored, updatedAt: "2026-10-01T00:00:00.000Z" } });
  });

  it("allows exactly maxPlusOnes", async () => {
    const { service } = setup(okInvitation(2));
    expect((await service.putByToken("t", { attending: true, plusOnesCount: 2 })).status).toBe("ok");
  });

  it("rejects more than maxPlusOnes without writing", async () => {
    const { service, upsert } = setup(okInvitation(1));
    const result = await service.putByToken("t", { attending: true, plusOnesCount: 2 });
    expect(result).toEqual({ status: "over_limit", maxPlusOnes: 1 });
    expect(upsert).not.toHaveBeenCalled();
  });

  it.each(["invalid", "expired"] as const)("passes through %s without writing", async (status) => {
    const { service, upsert } = setup({ status });
    expect(await service.putByToken("t", { attending: false, plusOnesCount: 0 })).toEqual({ status });
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("RsvpService.listAll", () => {
  it("maps answered and unanswered rows", async () => {
    const { service } = setup({ status: "invalid" }, [
      { invitationId: INVITATION_ID, guestName: "Jane", maxPlusOnes: 1, rsvp: stored },
      { invitationId: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e72", guestName: "Bob", maxPlusOnes: 0, rsvp: null },
    ]);
    const { items } = await service.listAll();
    expect(items[0].rsvp?.updatedAt).toBe("2026-10-01T00:00:00.000Z");
    expect(items[1].rsvp).toBeNull();
  });
});
