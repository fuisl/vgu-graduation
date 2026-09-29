import { describe, expect, it } from "vitest";
import { formatAdminDateTime, isoToZonedLocal, isValidTimeZone, zonedLocalToIso } from "./datetime";

const HCM = "Asia/Ho_Chi_Minh";

describe("zonedLocalToIso", () => {
  it("interprets the datetime-local value in the event's zone, not the runtime's", () => {
    expect(zonedLocalToIso("2026-11-21T09:00", HCM)).toBe("2026-11-21T09:00:00+07:00");
    expect(Date.parse(zonedLocalToIso("2026-11-21T09:00", HCM)!)).toBe(Date.parse("2026-11-21T02:00:00Z"));
  });

  it("keeps seconds when the input has them and handles the day boundary", () => {
    expect(zonedLocalToIso("2026-11-21T00:30:15", HCM)).toBe("2026-11-21T00:30:15+07:00");
  });

  it("uses the offset in effect on that date in zones with DST", () => {
    expect(zonedLocalToIso("2026-01-15T12:00", "Europe/Berlin")).toBe("2026-01-15T12:00:00+01:00");
    expect(zonedLocalToIso("2026-07-15T12:00", "Europe/Berlin")).toBe("2026-07-15T12:00:00+02:00");
    expect(zonedLocalToIso("2026-07-15T12:00", "America/New_York")).toBe("2026-07-15T12:00:00-04:00");
    expect(zonedLocalToIso("2026-07-15T12:00", "UTC")).toBe("2026-07-15T12:00:00+00:00");
  });

  it("rejects malformed values, impossible dates and unknown zones", () => {
    expect(zonedLocalToIso("", HCM)).toBeNull();
    expect(zonedLocalToIso("21/11/2026 09:00", HCM)).toBeNull();
    expect(zonedLocalToIso("2026-02-30T09:00", HCM)).toBeNull();
    expect(zonedLocalToIso("2026-11-21T24:00", HCM)).toBeNull();
    expect(zonedLocalToIso("2026-11-21T09:00", "Mars/Olympus")).toBeNull();
  });
});

describe("isoToZonedLocal", () => {
  it("renders a stored timestamp as wall-clock time in the event zone", () => {
    expect(isoToZonedLocal("2026-11-21T02:00:00.000Z", HCM)).toBe("2026-11-21T09:00");
    expect(isoToZonedLocal("2026-11-21T09:00:00+07:00", HCM)).toBe("2026-11-21T09:00");
    expect(isoToZonedLocal("2026-11-20T18:30:00Z", HCM)).toBe("2026-11-21T01:30");
  });

  it("round-trips with zonedLocalToIso", () => {
    const local = "2026-11-21T14:45";
    expect(isoToZonedLocal(zonedLocalToIso(local, HCM)!, HCM)).toBe(local);
  });

  it("returns an empty string for unparseable input", () => {
    expect(isoToZonedLocal("not a date", HCM)).toBe("");
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA zones and rejects anything else", () => {
    expect(isValidTimeZone(HCM)).toBe(true);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
  });
});

describe("formatAdminDateTime", () => {
  it("formats in the given zone with a 24-hour clock", () => {
    expect(formatAdminDateTime("2026-11-21T02:00:00.000Z", HCM)).toBe("21 Nov 2026, 09:00");
  });

  it("falls back to the raw value when it cannot parse it", () => {
    expect(formatAdminDateTime("garbage", HCM)).toBe("garbage");
  });
});
