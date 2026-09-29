import { describe, expect, it } from "vitest";
import { buildCalendarLinks, publicApiOrigin, toGoogleDate } from "./links";

const event = {
  name: "GRAD '26 Lễ tốt nghiệp",
  startsAt: "2026-11-14T02:00:00.000Z",
  endsAt: null,
  venue: { name: "Hội trường & Ceremony Hall", address: "Đại học Việt Đức, Bình Dương", mapUrl: "https://maps.app.goo.gl/x?a=1&b=2" },
  arrivalInfo: null,
};

describe("buildCalendarLinks", () => {
  const links = buildCalendarLinks(event, "https://api.example.test");

  it("derives webcal and https feed from the same host/path", () => {
    expect(links.webcal).toBe("webcal://api.example.test/event/calendar.ics");
    expect(links.ics).toBe("https://api.example.test/event/calendar.ics");
  });

  it("builds a Google link with UTC dates and the 2h default when endsAt is null", () => {
    const url = new URL(links.google);
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20261114T020000Z/20261114T040000Z");
    expect(url.searchParams.get("text")).toBe(event.name);
    expect(url.searchParams.get("location")).toBe("Hội trường & Ceremony Hall, Đại học Việt Đức, Bình Dương");
    expect(url.searchParams.get("details")).toContain("https://maps.app.goo.gl/x?a=1&b=2");
    expect(links.google).not.toContain(" ");
  });

  it("uses endsAt when present", () => {
    const l = buildCalendarLinks({ ...event, endsAt: "2026-11-14T05:30:00.000Z" }, "https://a.test");
    expect(new URL(l.google).searchParams.get("dates")).toBe("20261114T020000Z/20261114T053000Z");
    expect(new URL(l.outlook).searchParams.get("enddt")).toBe("2026-11-14T05:30:00.000Z");
  });

  it("builds an Outlook compose deeplink", () => {
    const url = new URL(links.outlook);
    expect(url.origin + url.pathname).toBe("https://outlook.live.com/calendar/0/deeplink/compose");
    expect(url.searchParams.get("rru")).toBe("addevent");
    expect(url.searchParams.get("subject")).toBe(event.name);
    expect(url.searchParams.get("startdt")).toBe("2026-11-14T02:00:00.000Z");
    expect(url.searchParams.get("enddt")).toBe("2026-11-14T04:00:00.000Z");
  });

  it("includes arrival info in details", () => {
    const l = buildCalendarLinks({ ...event, arrivalInfo: "Gate B & parking" }, "https://a.test");
    expect(new URL(l.google).searchParams.get("details")).toContain("Gate B & parking");
  });
});

describe("toGoogleDate", () => {
  it("formats UTC without separators or millis", () => {
    expect(toGoogleDate(new Date("2026-01-02T03:04:05.678Z"))).toBe("20260102T030405Z");
  });
});

describe("publicApiOrigin", () => {
  it("defaults, normalises and rejects junk", () => {
    expect(publicApiOrigin(undefined)).toBe("https://api.grad26.fuisloy.dev");
    expect(publicApiOrigin("https://api.x.test/")).toBe("https://api.x.test");
    expect(publicApiOrigin("not a url")).toBe("https://api.grad26.fuisloy.dev");
    expect(publicApiOrigin("javascript:alert(1)")).toBe("https://api.grad26.fuisloy.dev");
  });
});
