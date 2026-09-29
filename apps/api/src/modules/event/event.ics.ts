import type { StoredEvent } from "./event.repository.js";

/** Length of the VEVENT when `endsAt` is null: a ceremony slot, documented so calendars show a sensible block. */
export const DEFAULT_EVENT_DURATION_MS = 2 * 60 * 60 * 1000;

const CRLF = "\r\n";
const MAX_LINE_OCTETS = 75;

/** RFC 5545 §3.3.11 TEXT escaping: backslash, semicolon, comma and newlines. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * RFC 5545 §3.1 folding: content lines are limited to 75 octets excluding the CRLF; continuation
 * lines start with one space (which counts toward their 75). Never splits a UTF-8 character.
 */
export function foldLine(line: string): string {
  if (Buffer.byteLength(line, "utf8") <= MAX_LINE_OCTETS) return line;
  const parts: string[] = [];
  let current = "";
  let octets = 0;
  let limit = MAX_LINE_OCTETS;
  for (const char of line) {
    const size = Buffer.byteLength(char, "utf8");
    if (octets + size > limit) {
      parts.push(current);
      current = "";
      octets = 0;
      limit = MAX_LINE_OCTETS - 1;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

/** UTC basic form: 20260929T083000Z. */
export function formatUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export interface IcsOptions {
  /** Domain part of the stable UID, e.g. the public site's hostname. Never random. */
  uidDomain: string;
  /** Public site URL for the VEVENT URL property. */
  siteUrl: string;
}

/**
 * The public, subscribable calendar feed for the single ceremony. Contains no personal data:
 * only the public event fields. The UID is fixed so subscribed calendars update the same event
 * in place, and SEQUENCE / LAST-MODIFIED advance on every admin edit. Output is a pure function
 * of the stored row (DTSTAMP is updated_at) so responses are byte-stable and cacheable.
 */
export function buildIcs(event: StoredEvent, options: IcsOptions): string {
  const end = event.endsAt ?? new Date(event.startsAt.getTime() + DEFAULT_EVENT_DURATION_MS);

  const description = [
    event.timeConfirmed
      ? null
      : "Date and time to be confirmed. This calendar entry updates automatically once they are.",
    `Venue: ${event.venueName}, ${event.venueAddress}`,
    `Map: ${event.venueMapUrl}`,
    event.arrivalInfo,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GRAD 26//Graduation Ceremony//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(event.name)}`,
    `X-WR-TIMEZONE:${escapeText(event.timeZone)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
    "BEGIN:VEVENT",
    `UID:event-1@${options.uidDomain}`,
    `DTSTAMP:${formatUtc(event.updatedAt)}`,
    `LAST-MODIFIED:${formatUtc(event.updatedAt)}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTART:${formatUtc(event.startsAt)}`,
    `DTEND:${formatUtc(end)}`,
    `SUMMARY:${escapeText(event.name)}`,
    `LOCATION:${escapeText(`${event.venueName}, ${event.venueAddress}`)}`,
    `URL:${options.siteUrl}`,
    `DESCRIPTION:${escapeText(description)}`,
    `STATUS:${event.timeConfirmed ? "CONFIRMED" : "TENTATIVE"}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(foldLine).join(CRLF) + CRLF;
}
