import Fastify from "fastify";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { requireAdmin } from "./admin-auth.js";

const secret = new TextEncoder().encode("dev-only-change-me"); // matches config.ts default

function buildTestServer() {
  const app = Fastify();
  app.get("/protected", { preHandler: requireAdmin }, async () => ({ ok: true }));
  return app;
}

describe("requireAdmin", () => {
  it("rejects a request with no Authorization header", async () => {
    const app = buildTestServer();
    const response = await app.inject({ method: "GET", url: "/protected" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects a malformed Authorization header", async () => {
    const app = buildTestServer();
    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Basic abc123" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("allows a request with a valid bearer session token", async () => {
    const app = buildTestServer();
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("fuisl")
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(secret);

    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
  });
});
