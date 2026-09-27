import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mintAdminSession, verifyAdminSession } from "./session";

const ORIGINAL_SECRET = process.env.ADMIN_SESSION_SECRET;

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = "test-secret";
});

afterEach(() => {
  process.env.ADMIN_SESSION_SECRET = ORIGINAL_SECRET;
});

describe("mintAdminSession / verifyAdminSession", () => {
  it("round-trips the GitHub handle", async () => {
    const token = await mintAdminSession("fuisl");
    const result = await verifyAdminSession(token);
    expect(result).toEqual({ handle: "fuisl" });
  });

  it("rejects a token signed with a different secret (e.g. apps/api out of sync)", async () => {
    const token = await mintAdminSession("fuisl");
    process.env.ADMIN_SESSION_SECRET = "a-different-secret";
    const result = await verifyAdminSession(token);
    expect(result).toBeNull();
  });

  it("rejects garbage input", async () => {
    const result = await verifyAdminSession("not-a-jwt");
    expect(result).toBeNull();
  });
});
