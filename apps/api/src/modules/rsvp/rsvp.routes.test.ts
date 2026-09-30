import { adminRsvpListResponseSchema, putRsvpResponseSchema } from "@grad/contract";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import { buildServer } from "../../server.js";
import { approvedTester } from "../admin/admin-accounts.fake.js";
import type { ResolveResult } from "../invitations/invitations.service.js";
import type { StoredRsvp, StoredRsvpRow } from "./rsvp.repository.js";
import { RsvpService } from "./rsvp.service.js";

const config = loadConfig({ LOG_LEVEL: "silent" });
const TOKEN = "guest-bearer-token-value";
const INVITATION_ID = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";

const invitation = {
  id: INVITATION_ID,
  guest: { id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70", name: "Jane", email: null, phone: null },
  maxPlusOnes: 1,
  status: "active" as const,
  validFrom: null,
  validUntil: null,
  inviters: [],
  rsvp: null,
};

/** Real RsvpService over in-memory fakes: one stored RSVP, replaced on each PUT. */
function setup(resolve: (token: string) => ResolveResult = (t) => (t === TOKEN ? { status: "ok", invitation } : { status: "invalid" })) {
  let current: StoredRsvp | null = null;
  const rows: StoredRsvpRow[] = [];
  const service = new RsvpService(
    { resolveByToken: async (token) => resolve(token) },
    {
      upsert: async (_id, dto) => {
        current = {
          id: current?.id ?? "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e71",
          attending: dto.attending,
          plusOnesCount: dto.plusOnesCount,
          dietaryRequirements: dto.dietaryRequirements ?? null,
          notes: dto.notes ?? null,
          updatedAt: new Date("2026-10-01T00:00:00.000Z"),
        };
        return current;
      },
      listAll: async () => rows,
    },
  );
  return { service, rows };
}

const auth = { authorization: `Bearer ${TOKEN}` };
const body = { attending: true, plusOnesCount: 1, notes: "hello" };

async function adminToken() {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("tester")
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(config.adminSessionSecret));
}

describe("PUT /rsvp", () => {
  it("returns 401 with no credential", async () => {
    const app = buildServer({ adminAccounts: approvedTester(), config, rsvpService: setup().service });
    const res = await app.inject({ method: "PUT", url: "/rsvp", payload: body });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: "Unauthorized" });
  });

  it("returns 404 for an invalid or revoked token", async () => {
    const app = buildServer({ adminAccounts: approvedTester(), config, rsvpService: setup().service });
    const res = await app.inject({ method: "PUT", url: "/rsvp", headers: { authorization: "Bearer wrong" }, payload: body });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Not Found", message: "Invalid or revoked invitation" });
  });

  it("returns 410 for an expired invitation", async () => {
    const app = buildServer({ adminAccounts: approvedTester(), config, rsvpService: setup(() => ({ status: "expired" })).service });
    const res = await app.inject({ method: "PUT", url: "/rsvp", headers: auth, payload: body });
    expect(res.statusCode).toBe(410);
    expect(res.json()).toEqual({ error: "Gone", message: "This invitation has expired" });
  });

  it("returns 400 above maxPlusOnes", async () => {
    const app = buildServer({ adminAccounts: approvedTester(), config, rsvpService: setup().service });
    const res = await app.inject({ method: "PUT", url: "/rsvp", headers: auth, payload: { attending: true, plusOnesCount: 2 } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "Bad Request" });
  });

  it("returns 400 for a body that fails the contract", async () => {
    const app = buildServer({ adminAccounts: approvedTester(), config, rsvpService: setup().service });
    const res = await app.inject({ method: "PUT", url: "/rsvp", headers: auth, payload: { plusOnesCount: 0 } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Bad Request", message: "Request validation failed" });
  });

  it("creates then updates, with no-store and the contract shape", async () => {
    const app = buildServer({ adminAccounts: approvedTester(), config, rsvpService: setup().service });
    const created = await app.inject({ method: "PUT", url: "/rsvp", headers: auth, payload: body });
    expect(created.statusCode).toBe(200);
    expect(putRsvpResponseSchema.safeParse(created.json()).success).toBe(true);
    expect(created.headers["cache-control"]).toBe("no-store");
    expect(created.json()).toMatchObject({ attending: true, plusOnesCount: 1, notes: "hello" });

    const updated = await app.inject({ method: "PUT", url: "/rsvp", headers: auth, payload: { attending: false } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ id: created.json().id, attending: false, plusOnesCount: 0, notes: null });
  });

  it("accepts the inv cookie", async () => {
    const app = buildServer({ adminAccounts: approvedTester(), config, rsvpService: setup().service });
    const res = await app.inject({ method: "PUT", url: "/rsvp", headers: { cookie: `inv=${TOKEN}` }, payload: body });
    expect(res.statusCode).toBe(200);
  });
});

describe("GET /admin/rsvp", () => {
  it("returns 401 without an admin session", async () => {
    const app = buildServer({ adminAccounts: approvedTester(), config, rsvpService: setup().service });
    expect((await app.inject({ method: "GET", url: "/admin/rsvp" })).statusCode).toBe(401);
    const res = await app.inject({ method: "GET", url: "/admin/rsvp", headers: auth });
    expect(res.statusCode).toBe(401);
  });

  it("lists answered and unanswered invitations without tokens", async () => {
    const { service, rows } = setup();
    rows.push(
      {
        invitationId: INVITATION_ID,
        guestName: "Jane",
        maxPlusOnes: 1,
        rsvp: { id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e71", attending: true, plusOnesCount: 1, dietaryRequirements: null, notes: null, updatedAt: new Date("2026-10-01T00:00:00.000Z") },
      },
      { invitationId: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e72", guestName: "Bob", maxPlusOnes: 0, rsvp: null },
    );
    const app = buildServer({ adminAccounts: approvedTester(), config, rsvpService: service });
    const res = await app.inject({ method: "GET", url: "/admin/rsvp", headers: { authorization: `Bearer ${await adminToken()}` } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    const json = res.json();
    expect(adminRsvpListResponseSchema.safeParse(json).success).toBe(true);
    expect(json.items[1].rsvp).toBeNull();
    expect(res.body).not.toMatch(/token/i);
  });
});

describe("token hygiene in logs", () => {
  it("never writes the bearer token or cookie to the log", async () => {
    const lines: string[] = [];
    const app = buildServer({ adminAccounts: approvedTester(),
      config: { ...config, logLevel: "trace" },
      logStream: { write: (line) => void lines.push(line) },
      rsvpService: setup().service,
    });
    await app.inject({ method: "PUT", url: "/rsvp", headers: auth, payload: body });
    await app.inject({ method: "PUT", url: "/rsvp", headers: { cookie: `inv=${TOKEN}` }, payload: body });
    await app.inject({ method: "PUT", url: "/rsvp", headers: { authorization: "Bearer wrong-token-xyz" }, payload: body });
    await app.close();

    const output = lines.join("");
    expect(output).toContain("/rsvp");
    expect(output).not.toContain(TOKEN);
    expect(output).not.toContain("wrong-token-xyz");
  });
});
