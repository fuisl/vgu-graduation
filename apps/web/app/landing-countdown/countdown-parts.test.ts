import { describe, expect, it } from "vitest";
import { countdownParts, formatCountdown } from "./countdown-parts";

const at = Date.parse("2026-11-15T09:00:00+07:00");

describe("countdownParts", () => {
  it("splits the remaining time into days, hours, minutes and seconds", () => {
    const now = at - (3 * 86_400 + 4 * 3_600 + 5 * 60 + 6) * 1000;
    expect(countdownParts(at, now)).toEqual({ days: 3, hours: 4, minutes: 5, seconds: 6 });
  });

  it("drops partial seconds", () => {
    expect(countdownParts(at, at - 1_999)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 1 });
  });

  it("returns null at and after the start", () => {
    expect(countdownParts(at, at)).toBeNull();
    expect(countdownParts(at, at + 60_000)).toBeNull();
  });

  it("returns null for an invalid target", () => {
    expect(countdownParts(Number.NaN, at)).toBeNull();
  });
});

describe("formatCountdown", () => {
  it("joins the parts as 13D.20H.17M.29S with two-digit fields", () => {
    expect(formatCountdown({ days: 13, hours: 20, minutes: 17, seconds: 29 })).toBe("13D.20H.17M.29S");
    expect(formatCountdown({ days: 3, hours: 4, minutes: 5, seconds: 6 })).toBe("03D.04H.05M.06S");
    expect(formatCountdown({ days: 120, hours: 0, minutes: 0, seconds: 0 })).toBe("120D.00H.00M.00S");
  });
});
