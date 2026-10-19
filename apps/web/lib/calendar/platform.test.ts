import { describe, expect, it } from "vitest";
import type { CalendarLinks } from "./links";
import { calendarPlatform, primaryCalendarLink } from "./platform";

const links: CalendarLinks = {
  webcal: "webcal://api.example.test/event/calendar.ics",
  ics: "https://api.example.test/event/calendar.ics",
  google: "https://calendar.google.com/calendar/render?action=TEMPLATE",
  outlook: "https://outlook.live.com/calendar/0/deeplink/compose?rru=addevent",
};

const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_MODE = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

describe("calendarPlatform", () => {
  it("sends Android to Google Calendar, never webcal", () => {
    expect(calendarPlatform({ userAgent: ANDROID_CHROME })).toBe("android");
    expect(calendarPlatform({ userAgent: WINDOWS, userAgentData: { platform: "Android" } })).toBe("android");
    expect(primaryCalendarLink(links, "android")).toEqual({ href: links.google, external: true });
  });

  it("subscribes Apple devices, iPad in desktop mode included", () => {
    expect(calendarPlatform({ userAgent: IPHONE })).toBe("apple");
    expect(calendarPlatform({ userAgent: IPAD_DESKTOP_MODE })).toBe("apple");
    expect(calendarPlatform({ userAgentData: { platform: "macOS" } })).toBe("apple");
    expect(primaryCalendarLink(links, "apple")).toEqual({ href: links.webcal, external: false });
  });

  it("downloads the .ics file everywhere else, and before the browser is known", () => {
    expect(calendarPlatform({ userAgent: WINDOWS })).toBe("other");
    expect(calendarPlatform(undefined)).toBe("other");
    expect(calendarPlatform({})).toBe("other");
    expect(primaryCalendarLink(links, "other")).toEqual({ href: links.ics, external: false });
  });
});
