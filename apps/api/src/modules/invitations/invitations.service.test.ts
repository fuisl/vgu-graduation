import { describe, expect, it } from "vitest";
import { hashToken } from "../../auth/tokens.js";
import type { InvitationsRepository, StoredInvitation } from "./invitations.repository.js";
import { InvitationsService } from "./invitations.service.js";

const NOW = new Date("2026-11-10T00:00:00Z");
const TOKEN = "raw-token-value";

function stored(overrides: Partial<StoredInvitation> = {}): StoredInvitation {
  return {
    id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
    tokenHash: hashToken(TOKEN),
    maxPlusOnes: 1,
    status: "active",
    validFrom: null,
    validUntil: null,
    guest: { id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70", name: "Jane", email: null, phone: null },
    inviters: [],
    rsvp: null,
    ...overrides,
  };
}

function serviceWith(row: StoredInvitation | null) {
  const repository = { findByTokenHash: async () => row } as unknown as InvitationsRepository;
  return new InvitationsService(repository, () => NOW);
}

describe("resolveByToken", () => {
  it("resolves a valid invitation without leaking the hash", async () => {
    const result = await serviceWith(stored()).resolveByToken(TOKEN);
    expect(result.status).toBe("ok");
    expect(JSON.stringify(result)).not.toContain(hashToken(TOKEN));
  });

  it("rejects an unknown token", async () => {
    expect(await serviceWith(null).resolveByToken("wrong")).toEqual({ status: "invalid" });
  });

  it("rejects an empty token", async () => {
    expect(await serviceWith(stored()).resolveByToken("")).toEqual({ status: "invalid" });
  });

  it("rejects a revoked invitation as indistinguishable from unknown", async () => {
    const result = await serviceWith(stored({ status: "revoked" })).resolveByToken(TOKEN);
    expect(result).toEqual({ status: "invalid" });
  });

  it("flags an invitation past validUntil as expired", async () => {
    const row = stored({ validUntil: new Date("2026-11-09T23:59:59Z") });
    expect(await serviceWith(row).resolveByToken(TOKEN)).toEqual({ status: "expired" });
  });

  it("rejects an invitation before validFrom", async () => {
    const row = stored({ validFrom: new Date("2026-11-11T00:00:00Z") });
    expect(await serviceWith(row).resolveByToken(TOKEN)).toEqual({ status: "invalid" });
  });

  it("accepts inside the validity window", async () => {
    const row = stored({ validFrom: new Date("2026-11-01T00:00:00Z"), validUntil: new Date("2026-11-30T00:00:00Z") });
    expect((await serviceWith(row).resolveByToken(TOKEN)).status).toBe("ok");
  });

  it("rejects a row whose stored hash doesn't match the presented token", async () => {
    const row = stored({ tokenHash: hashToken("some-other-token") });
    expect(await serviceWith(row).resolveByToken(TOKEN)).toEqual({ status: "invalid" });
  });
});
