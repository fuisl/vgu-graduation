import type { EventConfig } from "@grad/contract";

/** Same fallback length as the API's .ics feed (apps/api/src/modules/event/event.ics.ts). */
export const DEFAULT_EVENT_DURATION_MS = 2 * 60 * 60 * 1000;

export const DEFAULT_PUBLIC_API_ORIGIN = "https://api.grad26.fuisloy.dev";

type CalendarEvent = Pick<EventConfig, "name" | "startsAt" | "endsAt" | "venue" | "arrivalInfo">;

export type CalendarLinks = {
  /** Subscribable feed: calendar apps keep it in sync when the date changes. */
  webcal: string;
  /** Plain https .ics, for download. */
  ics: string;
  google: string;
  outlook: string;
};

/** Public origin of the API (PUBLIC_API_ORIGIN), without trailing slash. Falls back to production. */
export function publicApiOrigin(raw: string | undefined = process.env.PUBLIC_API_ORIGIN): string {
  const value = raw?.trim();
  if (!value) return DEFAULT_PUBLIC_API_ORIGIN;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return DEFAULT_PUBLIC_API_ORIGIN;
    return url.origin;
  } catch {
    return DEFAULT_PUBLIC_API_ORIGIN;
  }
}

export function eventEnd(event: Pick<CalendarEvent, "startsAt" | "endsAt">): Date {
  return event.endsAt
    ? new Date(event.endsAt)
    : new Date(new Date(event.startsAt).getTime() + DEFAULT_EVENT_DURATION_MS);
}

/** `20261114T020000Z` (Google's UTC basic format). */
export function toGoogleDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function query(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

export function buildCalendarLinks(event: CalendarEvent, apiOrigin: string = publicApiOrigin()): CalendarLinks {
  const origin = new URL(apiOrigin).origin;
  const feedPath = "/event/calendar.ics";
  const start = new Date(event.startsAt);
  const end = eventEnd(event);
  const location = [event.venue.name, event.venue.address].filter(Boolean).join(", ");
  const details = [event.arrivalInfo, `Directions: ${event.venue.mapUrl}`].filter(Boolean).join("\n\n");

  return {
    webcal: `webcal://${new URL(origin).host}${feedPath}`,
    ics: `${origin}${feedPath}`,
    google:
      "https://calendar.google.com/calendar/render?" +
      query({
        action: "TEMPLATE",
        text: event.name,
        dates: `${toGoogleDate(start)}/${toGoogleDate(end)}`,
        details,
        location,
      }),
    outlook:
      "https://outlook.live.com/calendar/0/deeplink/compose?" +
      query({
        path: "/calendar/action/compose",
        rru: "addevent",
        subject: event.name,
        startdt: start.toISOString(),
        enddt: end.toISOString(),
        body: details,
        location,
      }),
  };
}
