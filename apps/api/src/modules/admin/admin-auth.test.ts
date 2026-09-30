import type { AdminAccessStatus } from "@grad/contract";
import Fastify from "fastify";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { fakeAdminAccounts } from "./admin-accounts.fake.js";
import { requireAdmin, requireOwner } from "./admin-auth.js";

const secret = new TextEncoder().encode("dev-only-change-me"); // matches config.ts default

function buildTestServer(accounts: Record<string, AdminAccessStatus> = {}) {
  const app = Fastify();
  app.decorate("adminAccounts", fakeAdminAccounts(accounts).store);
  app.get("/protected", { preHandler: requireAdmin }, async (request) => ({ handle: request.adminHandle }));
  app.get("/owners", { preHandler: requireOwner }, async () => ({ ok: true }));
  return app;
}

async function bearer(handle: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(handle)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
    .sign(secret);
  return { authorization: `Bearer ${token}` };
}

describe("requireAdmin", () => {
  it("rejects a request with no Authorization header", async () => {
    const response = await buildTestServer().inject({ method: "GET", url: "/protected" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects a malformed Authorization header", async () => {
    const response = await buildTestServer().inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Basic abc123" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("allows an approved admin and lowercases the handle", async () => {
    const response = await buildTestServer({ ann: "approved" }).inject({
      method: "GET",
      url: "/protected",
      headers: await bearer("Ann"),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ handle: "ann" });
  });

  it("allows an owner without an account row", async () => {
    const response = await buildTestServer().inject({ method: "GET", url: "/protected", headers: await bearer("fuisl") });
    expect(response.statusCode).toBe(200);
  });

  it.each(["pending", "rejected", "revoked"] as const)("refuses a %s account with 403", async (status) => {
    const response = await buildTestServer({ ann: status }).inject({
      method: "GET",
      url: "/protected",
      headers: await bearer("ann"),
    });
    expect(response.statusCode).toBe(403);
  });

  it("refuses a valid session for a handle that never signed in", async () => {
    const response = await buildTestServer().inject({ method: "GET", url: "/protected", headers: await bearer("stranger") });
    expect(response.statusCode).toBe(403);
  });
});

describe("requireOwner", () => {
  it("refuses an approved admin who is not an owner", async () => {
    const response = await buildTestServer({ ann: "approved" }).inject({
      method: "GET",
      url: "/owners",
      headers: await bearer("ann"),
    });
    expect(response.statusCode).toBe(403);
  });

  it("allows an owner", async () => {
    const response = await buildTestServer().inject({ method: "GET", url: "/owners", headers: await bearer("FuIsL") });
    expect(response.statusCode).toBe(200);
  });
});
