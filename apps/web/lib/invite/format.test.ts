import { describe, expect, it } from "vitest";
import { createI18n } from "../i18n/dictionary";
import { formatEventWhen, summarizeRsvp } from "./format";

const en = createI18n("en");

const base = { startsAt: "2026-11-21T09:00:00+07:00", timeZone: "Asia/Ho_Chi_Minh" };

describe("formatEventWhen", () => {
  it("says time to be confirmed when the time is a placeholder", () => {
    const { date, time } = formatEventWhen({ ...base, timeConfirmed: false }, en);
    expect(date).toContain("21 November 2026");
    expect(time).toBe("Time to be confirmed");
  });
  it("shows the clock time in the event time zone once confirmed", () => {
    expect(formatEventWhen({ ...base, timeConfirmed: true }, en).time).toBe("09:00");
  });
});

describe("summarizeRsvp", () => {
  const rsvp = { id: "x", attending: true, plusOnesCount: 0, dietaryRequirements: null, notes: null, updatedAt: "" };
  it("covers each status", () => {
    expect(summarizeRsvp(null, en)).toMatch(/not responded/);
    expect(summarizeRsvp({ ...rsvp, attending: false }, en)).toMatch(/cannot attend/);
    expect(summarizeRsvp(rsvp, en)).toBe("You are attending.");
    expect(summarizeRsvp({ ...rsvp, plusOnesCount: 2 }, en)).toMatch(/2 guests/);
  });
});
