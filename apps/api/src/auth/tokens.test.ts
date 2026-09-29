import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateToken, hashToken, safeEqual } from "./tokens.js";

afterEach(() => vi.restoreAllMocks());

describe("generateToken", () => {
  it("is 128 bits of base64url and different every time", () => {
    const a = generateToken();
    expect(Buffer.from(a, "base64url")).toHaveLength(16);
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(generateToken()).not.toBe(a);
  });
});

describe("hashToken", () => {
  it("is a stable SHA-256 hex digest", () => {
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("safeEqual", () => {
  it("matches only identical strings", () => {
    expect(safeEqual("secret", "secret")).toBe(true);
    expect(safeEqual("secret", "secreT")).toBe(false);
  });

  it("does not throw or short-circuit on different lengths", () => {
    expect(safeEqual("short", "a-much-longer-value")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
  });

  it("delegates to crypto.timingSafeEqual on equal-length digests", () => {
    const spy = vi.spyOn(crypto, "timingSafeEqual");
    safeEqual("aaa", "bbbbbbbbbbbb");
    expect(spy).toHaveBeenCalledTimes(1);
    const [left, right] = spy.mock.calls[0] as [Buffer, Buffer];
    expect(left).toHaveLength(32);
    expect(right).toHaveLength(32);
  });
});
