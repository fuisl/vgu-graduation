import type { CalendarLinks } from "./links";

/**
 * Which calendar the primary "Add to calendar" opens (QA P1-3). `webcal://` does nothing on
 * Android Chrome, so Android gets Google Calendar; Apple devices subscribe to the feed (it
 * follows a changed time); everything else, and the server render, downloads the `.ics` file,
 * which every desktop calendar and iOS Safari open. Every option stays listed beside it.
 */
export type CalendarPlatform = "apple" | "android" | "other";

type NavigatorLike = {
  userAgent?: string;
  userAgentData?: { platform?: string };
};

export function calendarPlatform(nav: NavigatorLike | undefined): CalendarPlatform {
  if (!nav) return "other";
  const hinted = nav.userAgentData?.platform?.toLowerCase() ?? "";
  if (hinted === "android") return "android";
  if (hinted === "macos" || hinted === "ios") return "apple";
  const ua = nav.userAgent ?? "";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "apple";
  // iPadOS reports a Mac user agent by default; both are Apple Calendar.
  if (/macintosh/i.test(ua)) return "apple";
  return "other";
}

export type PrimaryCalendarLink = { href: string; external: boolean };

export function primaryCalendarLink(links: CalendarLinks, platform: CalendarPlatform): PrimaryCalendarLink {
  if (platform === "android") return { href: links.google, external: true };
  if (platform === "apple") return { href: links.webcal, external: false };
  return { href: links.ics, external: false };
}
