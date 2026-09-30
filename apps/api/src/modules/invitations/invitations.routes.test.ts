import { invitationSchema } from "@grad/contract";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import { buildServer } from "../../server.js";
import { approvedTester } from "../admin/admin-accounts.fake.js";
import type { InvitationsService, ResolveResult } from "./invitations.service.js";

const config = loadConfig({ LOG_LEVEL: "silent" });
const TOKEN = "guest-bearer-token-value";

const invitation = {
  id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
  guest: { id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70", name: "Jane", email: null, phone: null },
  maxPlusOnes: 1,
  status: "active" as const,
  validFrom: null,
  validUntil: null,
  inviters: [],
  rsvp: {
    id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e71",
    attending: true,
    plusOnesCount: 1,
    dietaryRequirements: null,
    notes: null,
    updatedAt: "2026-10-01T00:00:00.000Z",
  },
};

function fakeService(resolve: (token: string) => ResolveResult) {
  const seen: string[] = [];
  const service = {
    resolveByToken: async (token: string) => {
      seen.push(token);
      return resolve(token);
    },
    issueInvitation: async () => {
      throw new Error("db down");
    },
    rotateInvitationToken: async () => null,
  } as unknown as InvitationsService;
  return { service, seen };
}

const okFor = (token: string): ResolveResult =>
  token === TOKEN ? { status: "ok", invitation } : { status: "invalid" };

async function adminToken() {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("tester")
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(config.adminSessionSecret));
}

describe("GET /invitations/me", () => {
  it("returns 401 with no credential", async () => {
    const app = buildServer({ adminAccounts: approvedTester(), config, invitationsService: fakeService(okFor).service });
    const res = await app.inject({ method: "GET", url: "/invitations/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: "Unauthorized" });
  });

  it("resolves from a Bearer token and returns the contract shape", async () => {
    const app = buildServer({ adminAccounts: approvedTester(), config, invitationsService: fakeService(okFor).service });
    const res = await app.inject({ method: "GET", url: "/invitations/me", headers: { authorization: `Bearer ${TOKEN}` } });
    expect(res.statusCode).toBe(200);
    expect(invitationSchema.safeParse(res.json()).success).toBe(true);
    expect(res.headers["cache-control"]).toContain("s-maxage=60");
  });

  it("resolves from the inv cookie", async () => {
    const app = buildServer({ adminAccounts: approvedTester(), config, invitationsService: fakeService(okFor).service });
    const res = await app.inject({ method: "GET", url: "/invitations/me", headers: { cookie: `inv=${TOKEN}` } });
    expect(res.statusCode).toBe(200);
  });

  it("prefers the Authorization header over the cookie", async () => {
    const { service, seen } = fakeService(okFor);
    const app = buildServer({ adminAccounts: approvedTester(), config, invitationsService: service });
    await app.inject({ method: "GET", url: "/invitations/me", headers: { authorization: `Bearer ${TOKEN}`, cookie: "inv=other" } });
    expect(seen).toEqual([TOKEN]);
  });

  it("returns 404 for a wrong or revoked token", async () => {
    const app = buildServer({ adminAccounts: approvedTester(), config, invitationsService: fakeService(okFor).service });
    const res = await app.inject({ method: "GET", url: "/invitations/me", headers: { authorization: "Bearer wrong" } });
    expect(res.statusCode).toBe(404);
  });

  it("returns 410 for an expired invitation", async () => {
    const app = buildServer({ adminAccounts: approvedTester(), config, invitationsService: fakeService(() => ({ status: "expired" })).service });
    const res = await app.inject({ method: "GET", url: "/invitations/me", headers: { authorization: `Bearer ${TOKEN}` } });
    expect(res.statusCode).toBe(410);
    expect(res.json()).toEqual({ error: "Gone", message: "This invitation has expired" });
  });
});

describe("admin routes", () => {
  const payload = { guestName: "Jane", inviterUserIds: ["3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f"] };

  it("rejects a request without an admin session", async () => {
    const app = buildServer({ adminAccounts: approvedTester(), config, invitationsService: fakeService(okFor).service });
    const res = await app.inject({ method: "POST", url: "/admin/invitations", payload });
    expect(res.statusCode).toBe(401);
  });

  it("rejects an invitation token used as an admin credential", async () => {
    const app = buildServer({ adminAccounts: approvedTester(), config, invitationsService: fakeService(okFor).service });
    const res = await app.inject({ method: "POST", url: "/admin/invitations", headers: { authorization: `Bearer ${TOKEN}` }, payload });
    expect(res.statusCode).toBe(401);
  });

  it("validates the body against the contract", async () => {
    const app = buildServer({ adminAccounts: approvedTester(), config, invitationsService: fakeService(okFor).service });
    const res = await app.inject({
      method: "POST",
      url: "/admin/invitations",
      headers: { authorization: `Bearer ${await adminToken()}` },
      payload: { guestName: "", inviterUserIds: [] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Bad Request", message: "Request validation failed" });
  });

  it("hides internal errors behind a generic 500", async () => {
    const app = buildServer({ adminAccounts: approvedTester(), config, invitationsService: fakeService(okFor).service });
    const res = await app.inject({
      method: "POST",
      url: "/admin/invitations",
      headers: { authorization: `Bearer ${await adminToken()}` },
      payload,
    });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("db down");
  });
});

describe("token hygiene in logs", () => {
  it("never writes the bearer token or cookie to the log", async () => {
    const lines: string[] = [];
    const app = buildServer({ adminAccounts: approvedTester(),
      config: { ...config, logLevel: "trace" },
      logStream: { write: (line) => void lines.push(line) },
      invitationsService: fakeService(okFor).service,
    });
    await app.inject({ method: "GET", url: "/invitations/me", headers: { authorization: `Bearer ${TOKEN}` } });
    await app.inject({ method: "GET", url: "/invitations/me", headers: { cookie: `inv=${TOKEN}` } });
    await app.inject({ method: "GET", url: "/invitations/me", headers: { authorization: "Bearer wrong-token-xyz" } });
    await app.close();

    const output = lines.join("");
    expect(output).toContain("/invitations/me");
    expect(output).not.toContain(TOKEN);
    expect(output).not.toContain("wrong-token-xyz");
  });
});
