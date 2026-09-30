import { adminAccessSchema, adminAccountSchema, adminAccountsResponseSchema } from "@grad/contract";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import { buildServer } from "../../server.js";
import { fakeAdminAccounts } from "./admin-accounts.fake.js";

const config = loadConfig({ LOG_LEVEL: "silent" });

async function as(handle: string) {
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(handle)
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(config.adminSessionSecret));
  return { authorization: `Bearer ${jwt}` };
}

function build(accounts: Parameters<typeof fakeAdminAccounts>[0] = {}) {
  const fake = fakeAdminAccounts(accounts);
  return { app: buildServer({ config, adminAccounts: fake.store }), ...fake };
}

describe("POST /admin/access", () => {
  it("requires a valid session", async () => {
    const { app } = build();
    expect((await app.inject({ method: "POST", url: "/admin/access" })).statusCode).toBe(401);
  });

  it("files a pending request on first sign-in", async () => {
    const { app, accounts } = build();
    const res = await app.inject({ method: "POST", url: "/admin/access", headers: await as("NewGrad") });
    expect(res.statusCode).toBe(200);
    expect(adminAccessSchema.parse(res.json())).toEqual({ handle: "newgrad", status: "pending", owner: false });
    expect(accounts.get("newgrad")?.status).toBe("pending");
  });

  it("does not reopen a rejected request", async () => {
    const { app } = build({ ann: "rejected" });
    const res = await app.inject({ method: "POST", url: "/admin/access", headers: await as("ann") });
    expect(res.json()).toMatchObject({ status: "rejected" });
  });

  it("reports owners as approved", async () => {
    const { app, accounts } = build();
    const res = await app.inject({ method: "POST", url: "/admin/access", headers: await as("fuisl") });
    expect(res.json()).toEqual({ handle: "fuisl", status: "approved", owner: true });
    expect(accounts.size).toBe(0);
  });
});

describe("GET /admin/me", () => {
  it("returns the approved admin", async () => {
    const { app } = build({ ann: "approved" });
    const res = await app.inject({ method: "GET", url: "/admin/me", headers: await as("ann") });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ handle: "ann", status: "approved", owner: false });
  });

  it("refuses a pending account", async () => {
    const { app } = build({ ann: "pending" });
    expect((await app.inject({ method: "GET", url: "/admin/me", headers: await as("ann") })).statusCode).toBe(403);
  });
});

describe("GET /admin/accounts", () => {
  it("is owners-only", async () => {
    const { app } = build({ ann: "approved" });
    expect((await app.inject({ method: "GET", url: "/admin/accounts", headers: await as("ann") })).statusCode).toBe(403);
  });

  it("lists every account for an owner", async () => {
    const { app } = build({ fuisl: "approved", ann: "pending" });
    const res = await app.inject({ method: "GET", url: "/admin/accounts", headers: await as("fuisl") });
    expect(res.statusCode).toBe(200);
    const body = adminAccountsResponseSchema.parse(res.json());
    expect(body.items.map((a) => [a.handle, a.status, a.owner])).toEqual([
      ["fuisl", "approved", true],
      ["ann", "pending", false],
    ]);
  });
});

describe("POST /admin/accounts/:handle/:decision", () => {
  it("lets an owner approve a pending request, recording the owner as actor", async () => {
    const { app, decisions } = build({ ann: "pending" });
    const res = await app.inject({ method: "POST", url: "/admin/accounts/Ann/approve", headers: await as("fuisl") });
    expect(res.statusCode).toBe(200);
    expect(adminAccountSchema.parse(res.json())).toMatchObject({ handle: "ann", status: "approved", decidedBy: "fuisl" });
    expect(decisions).toEqual([["ann", "approve", "fuisl"]]);
  });

  it("refuses a non-owner admin", async () => {
    const { app } = build({ ann: "approved", bob: "pending" });
    const res = await app.inject({ method: "POST", url: "/admin/accounts/bob/approve", headers: await as("ann") });
    expect(res.statusCode).toBe(403);
  });

  it("returns 409 for a transition that does not apply", async () => {
    const { app } = build({ ann: "pending" });
    const res = await app.inject({ method: "POST", url: "/admin/accounts/ann/revoke", headers: await as("fuisl") });
    expect(res.statusCode).toBe(409);
  });

  it("returns 409 for an owner's own account", async () => {
    const { app } = build({ fuisl: "approved" });
    const res = await app.inject({ method: "POST", url: "/admin/accounts/fuisl/revoke", headers: await as("fuisl") });
    expect(res.statusCode).toBe(409);
  });

  it("returns 404 for a handle that never signed in", async () => {
    const { app } = build();
    const res = await app.inject({ method: "POST", url: "/admin/accounts/ghost/approve", headers: await as("fuisl") });
    expect(res.statusCode).toBe(404);
  });

  it("rejects an unknown decision or malformed handle", async () => {
    const { app } = build({ ann: "pending" });
    const headers = await as("fuisl");
    expect((await app.inject({ method: "POST", url: "/admin/accounts/ann/delete", headers })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/admin/accounts/-bad-/approve", headers })).statusCode).toBe(400);
  });

  it("revoked admins lose access on their next request", async () => {
    const { app } = build({ ann: "approved" });
    await app.inject({ method: "POST", url: "/admin/accounts/ann/revoke", headers: await as("fuisl") });
    expect((await app.inject({ method: "GET", url: "/admin/me", headers: await as("ann") })).statusCode).toBe(403);
  });
});
