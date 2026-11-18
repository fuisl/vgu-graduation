import { describe, expect, it } from "vitest";
import { SlidingWindowLimiter } from "./sliding-window.js";

describe("SlidingWindowLimiter", () => {
  it("allows the limit per window, then frees up as hits age out, and refunds", () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(2, 1000, () => now);
    expect(limiter.take("a")).toBe(true);
    expect(limiter.take("a")).toBe(true);
    expect(limiter.take("a")).toBe(false);
    expect(limiter.take("b")).toBe(true);
    limiter.refund("a");
    expect(limiter.take("a")).toBe(true);
    now = 1000;
    expect(limiter.take("a")).toBe(true);
  });

  it("says how long until the oldest blocking hit ages out", () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(2, 10 * 60_000, () => now);
    expect(limiter.retryAfterSeconds("ip")).toBe(0);
    limiter.take("ip");
    now = 60_000;
    limiter.take("ip");
    expect(limiter.take("ip")).toBe(false);
    // The first hit (t=0) frees a slot at t=600 s; it is now t=60 s.
    expect(limiter.retryAfterSeconds("ip")).toBe(540);
    now = 599_500;
    expect(limiter.retryAfterSeconds("ip")).toBe(1);
    now = 600_000;
    expect(limiter.retryAfterSeconds("ip")).toBe(0);
    expect(limiter.take("ip")).toBe(true);
  });

  it("does not count refused attempts against the window", () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(1, 1000, () => now);
    expect(limiter.take("k")).toBe(true);
    now = 900;
    expect(limiter.take("k")).toBe(false);
    now = 1000;
    expect(limiter.take("k")).toBe(true);
  });
});
