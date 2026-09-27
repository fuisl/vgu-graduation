import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { verifyAdminSession } from "./admin-session.js";

const secretString = "dev-only-change-me"; // matches config.ts default
const secret = new TextEncoder().encode(secretString);

async function signToken(handle: string, ttlSeconds: number) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(handle)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(secret);
}

describe("verifyAdminSession", () => {
  it("accepts a validly-signed, unexpired token and returns the handle", async () => {
    const token = await signToken("fuisl", 3600);
    const result = await verifyAdminSession(token);
    expect(result).toEqual({ handle: "fuisl" });
  });

  it("rejects an expired token", async () => {
    const token = await signToken("fuisl", -10);
    const result = await verifyAdminSession(token);
    expect(result).toBeNull();
  });

  it("rejects a token signed with the wrong secret", async () => {
    const wrongSecret = new TextEncoder().encode("not-the-real-secret");
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("fuisl")
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(wrongSecret);

    const result = await verifyAdminSession(token);
    expect(result).toBeNull();
  });

  it("rejects garbage input", async () => {
    const result = await verifyAdminSession("not-a-jwt");
    expect(result).toBeNull();
  });
});
