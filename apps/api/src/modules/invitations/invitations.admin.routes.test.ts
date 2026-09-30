import { adminInvitationsResponseSchema, revokeInvitationResponseSchema } from "@grad/contract";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import { buildServer } from "../../server.js";
import { approvedTester } from "../admin/admin-accounts.fake.js";
import { UnknownInviterError } from "./invitations.repository.js";
import type { InvitationsService } from "./invitations.service.js";

const config = loadConfig({ LOG_LEVEL: "silent" });
const ID = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";
const INVITER = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70";

async function adminHeaders() {
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("tester")
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(config.adminSessionSecret));
  return { authorization: `Bearer ${jwt}` };
}

const row = {
  id: ID,
  guest: { id: INVITER, name: "Jane", email: null, phone: null },
  status: "active" as const,
  maxPlusOnes: 1,
  inviters: [{ id: INVITER, name: "Ann", email: "ann@example.com" }],
  rsvp: null,
  createdAt: "2026-10-01T00:00:00.000Z",
};

function build(overrides: Partial<Record<keyof InvitationsService, unknown>> = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const service = {
    issueInvitation: async (...args: unknown[]) => {
      calls.push({ method: "issue", args });
      throw new UnknownInviterError();
    },
    revokeInvitation: async (...args: unknown[]) => {
      calls.push({ method: "revoke", args });
      return { id: ID, status: "revoked", revokedAt: "2026-10-02T00:00:00.000Z" };
    },
    listInvitations: async () => ({ items: [row] }),
    ...overrides,
  } as unknown as InvitationsService;
  return { app: buildServer({ adminAccounts: approvedTester(), config, invitationsService: service }), calls };
}

describe("POST /admin/invitations/:id/revoke", () => {
  it("requires an admin session", async () => {
    const { app } = build();
    const res = await app.inject({ method: "POST", url: `/admin/invitations/${ID}/revoke` });
    expect(res.statusCode).toBe(401);
  });

  it("revokes and passes the admin handle as actor", async () => {
    const { app, calls } = build();
    const res = await app.inject({
      method: "POST",
      url: `/admin/invitations/${ID}/revoke`,
      headers: await adminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(revokeInvitationResponseSchema.safeParse(res.json()).success).toBe(true);
    expect(calls).toEqual([{ method: "revoke", args: [ID, "tester"] }]);
  });

  it("is repeatable: a second call returns 200 with the same body", async () => {
    const { app } = build();
    const headers = await adminHeaders();
    const url = `/admin/invitations/${ID}/revoke`;
    const first = await app.inject({ method: "POST", url, headers });
    const second = await app.inject({ method: "POST", url, headers });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
  });

  it("returns 404 for an unknown id and 400 for a malformed one", async () => {
    const { app } = build({ revokeInvitation: async () => null });
    const headers = await adminHeaders();
    const missing = await app.inject({ method: "POST", url: `/admin/invitations/${ID}/revoke`, headers });
    expect(missing.statusCode).toBe(404);
    const bad = await app.inject({ method: "POST", url: "/admin/invitations/nope/revoke", headers });
    expect(bad.statusCode).toBe(400);
  });

  it("makes GET /invitations/me return 404 for the revoked token", async () => {
    // A stateful fake: revoke flips the flag that resolveByToken reads.
    let revoked = false;
    const { app } = build({
      revokeInvitation: async () => {
        revoked = true;
        return { id: ID, status: "revoked", revokedAt: "2026-10-02T00:00:00.000Z" };
      },
      resolveByToken: async () =>
        revoked ? { status: "invalid" } : { status: "ok", invitation: { ...row, validFrom: null, validUntil: null } },
    });
    const guest = { authorization: "Bearer guest-token" };
    expect((await app.inject({ method: "GET", url: "/invitations/me", headers: guest })).statusCode).toBe(200);
    await app.inject({ method: "POST", url: `/admin/invitations/${ID}/revoke`, headers: await adminHeaders() });
    const after = await app.inject({ method: "GET", url: "/invitations/me", headers: guest });
    expect(after.statusCode).toBe(404);
  });
});

describe("GET /admin/invitations", () => {
  it("requires an admin session", async () => {
    const { app } = build();
    expect((await app.inject({ method: "GET", url: "/admin/invitations" })).statusCode).toBe(401);
  });

  it("returns the list uncached and without token material", async () => {
    const { app } = build();
    const res = await app.inject({ method: "GET", url: "/admin/invitations", headers: await adminHeaders() });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(adminInvitationsResponseSchema.safeParse(res.json()).success).toBe(true);
    expect(res.body).not.toMatch(/token/i);
  });
});

describe("POST /admin/invitations with an unknown inviter", () => {
  it("returns 400 { error, message } instead of a 500", async () => {
    const { app, calls } = build();
    const res = await app.inject({
      method: "POST",
      url: "/admin/invitations",
      headers: await adminHeaders(),
      payload: { guestName: "Jane", inviterUserIds: [INVITER] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Bad Request", message: "One or more inviters do not exist" });
    expect(calls[0].args[1]).toBe("tester");
  });
});
