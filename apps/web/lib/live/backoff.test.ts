import { describe, expect, it } from "vitest";
import { backoffDelay } from "./backoff";

const opts = { baseMs: 1_000, maxMs: 30_000, minMs: 500 };

describe("backoffDelay", () => {
  it("grows the cap exponentially and stops at maxMs", () => {
    const top = (attempt: number) => backoffDelay(attempt, opts, () => 1);
    expect([0, 1, 2, 3, 4, 5, 6, 20].map(top)).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000]);
  });

  it("never goes below minMs, even with zero jitter", () => {
    expect(backoffDelay(0, opts, () => 0)).toBe(500);
    expect(backoffDelay(10, opts, () => 0)).toBe(500);
  });

  it("spreads retries uniformly between the floor and the cap", () => {
    expect(backoffDelay(2, opts, () => 0.5)).toBe(2_250);
  });

  it("tolerates odd inputs", () => {
    expect(backoffDelay(-3, opts, () => 1)).toBe(1_000);
    expect(backoffDelay(Number.MAX_SAFE_INTEGER, opts, () => 1)).toBe(30_000);
    expect(backoffDelay(1, opts, () => 7)).toBe(2_000);
  });
});
