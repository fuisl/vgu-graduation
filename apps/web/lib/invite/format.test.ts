import { describe, expect, it } from "vitest";
import { formatEventWhen, summarizeRsvp } from "./format";

const base = { startsAt: "2026-11-21T09:00:00+07:00", timeZone: "Asia/Ho_Chi_Minh" };

describe("formatEventWhen", () => {
  it("says time to be confirmed when the time is a placeholder", () => {
    const { date, time } = formatEventWhen({ ...base, timeConfirmed: false });
    expect(date).toContain("21 November 2026");
    expect(time).toBe("Time to be confirmed");
  });
  it("shows the clock time in the event time zone once confirmed", () => {
    expect(formatEventWhen({ ...base, timeConfirmed: true }).time).toBe("09:00");
  });
});

describe("summarizeRsvp", () => {
  const rsvp = { id: "x", attending: true, plusOnesCount: 0, dietaryRequirements: null, notes: null, updatedAt: "" };
  it("covers each status", () => {
    expect(summarizeRsvp(null)).toMatch(/not responded/);
    expect(summarizeRsvp({ ...rsvp, attending: false })).toMatch(/cannot attend/);
    expect(summarizeRsvp(rsvp)).toBe("You are attending.");
    expect(summarizeRsvp({ ...rsvp, plusOnesCount: 2 })).toMatch(/2 guests/);
  });
});
