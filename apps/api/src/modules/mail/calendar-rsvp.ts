import { DEFAULT_EVENT_DURATION_MS, escapeText, foldLine, formatUtc } from "../event/event.ics.js";
import type { StoredEvent } from "../event/event.repository.js";

/*
 * Calendar RSVP by email (ADR-013), iTIP (RFC 5546) over iMIP (RFC 6047). The
 * invitation email carries a METHOD:REQUEST event with the guest as ATTENDEE,
 * so Gmail, Outlook and Apple Mail show Yes / Maybe / No. Their answer comes
 * back to the organizer's mailbox as a METHOD:REPLY, which the worker reads.
 */

const CRLF = "\r\n";

/** Each invitation gets its own event, so its reply names the invitation. Not a credential: ids are not secret. */
export function inviteUid(invitationId: string, uidDomain: string): string {
  return `invite-${invitationId}@${uidDomain}`;
}

const UID_PATTERN = /^invite-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@(.+)$/i;

/** The invitation id behind a reply's UID, if it is one of ours. */
export function invitationIdFromUid(uid: string, uidDomain: string): string | null {
  const match = UID_PATTERN.exec(uid.trim());
  if (!match || match[2]!.toLowerCase() !== uidDomain.toLowerCase()) return null;
  return match[1]!.toLowerCase();
}

/** A parameter value (CN): quoted, with the characters RFC 5545 forbids inside quotes removed. */
function paramText(value: string): string {
  return `"${value.replace(/["\r\n\u0000-\u001f]/g, "").slice(0, 120)}"`;
}

export interface InviteRequestInput {
  event: StoredEvent;
  invitationId: string;
  uidDomain: string;
  siteUrl: string;
  organizer: { email: string; name: string };
  attendee: { email: string; name: string };
  now: Date;
}

/**
 * The METHOD:REQUEST calendar object for one guest. SEQUENCE follows the event's,
 * so a later request after an admin edit replaces this one in the guest's calendar.
 */
export function buildInviteRequest(input: InviteRequestInput): string {
  const { event, organizer, attendee } = input;
  const end = event.endsAt ?? new Date(event.startsAt.getTime() + DEFAULT_EVENT_DURATION_MS);
  const description = [
    event.timeConfirmed
      ? null
      : "Date and time to be confirmed. We'll send an update when they are. / Thời gian sẽ được xác nhận sau.",
    `Venue: ${event.venueName}, ${event.venueAddress}`,
    `Map: ${event.venueMapUrl}`,
    `Details: ${input.siteUrl}/venue`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GRAD 26//Graduation Ceremony//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${inviteUid(input.invitationId, input.uidDomain)}`,
    `DTSTAMP:${formatUtc(input.now)}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTART:${formatUtc(event.startsAt)}`,
    `DTEND:${formatUtc(end)}`,
    `SUMMARY:${escapeText(event.name)}`,
    `LOCATION:${escapeText(`${event.venueName}, ${event.venueAddress}`)}`,
    `URL:${input.siteUrl}`,
    `DESCRIPTION:${escapeText(description)}`,
    `ORGANIZER;CN=${paramText(organizer.name)}:mailto:${organizer.email}`,
    `ATTENDEE;CN=${paramText(attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendee.email}`,
    `STATUS:${event.timeConfirmed ? "CONFIRMED" : "TENTATIVE"}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}

export type PartStat = "ACCEPTED" | "DECLINED" | "TENTATIVE";

export interface CalendarReply {
  uid: string;
  /** The answering attendee's address, lower-cased. */
  attendee: string;
  partstat: PartStat;
  /** When the guest answered, from DTSTAMP; null when absent or unreadable. */
  answeredAt: Date | null;
}

interface Property {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** RFC 5545 §3.1: unfold, then split each line into name, parameters and value (quotes respected). */
function properties(ics: string): Property[] {
  const unfolded = ics.replace(/\r?\n[ \t]/g, "");
  const out: Property[] = [];
  for (const line of unfolded.split(/\r?\n/)) {
    if (!line) continue;
    let i = 0;
    let quoted = false;
    for (; i < line.length; i++) {
      const c = line[i];
      if (c === '"') quoted = !quoted;
      else if (c === ":" && !quoted) break;
    }
    if (i >= line.length) continue;
    const head = line.slice(0, i);
    const value = line.slice(i + 1);
    const [name, ...rawParams] = head.match(/(?:[^;"]|"[^"]*")+/g) ?? [];
    if (!name) continue;
    const params: Record<string, string> = {};
    for (const raw of rawParams) {
      const eq = raw.indexOf("=");
      if (eq > 0) params[raw.slice(0, eq).toUpperCase()] = raw.slice(eq + 1).replace(/^"|"$/g, "");
    }
    out.push({ name: name.toUpperCase(), params, value });
  }
  return out;
}

/** 20261019T081500Z (UTC basic form), the only DTSTAMP form RFC 5545 allows. */
function parseUtc(value: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value.trim());
  if (!m) return null;
  const date = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Reads an iTIP REPLY: the first VEVENT's UID, DTSTAMP and the one attendee
 * who answered. Anything else (a REQUEST, a CANCEL, NEEDS-ACTION, no attendee)
 * is null, so the caller ignores it.
 */
export function parseCalendarReply(ics: string): CalendarReply | null {
  const props = properties(ics);
  const method = props.find((p) => p.name === "METHOD")?.value.trim().toUpperCase();
  if (method !== "REPLY") return null;
  const start = props.findIndex((p) => p.name === "BEGIN" && p.value.trim().toUpperCase() === "VEVENT");
  if (start < 0) return null;
  const end = props.findIndex((p, i) => i > start && p.name === "END" && p.value.trim().toUpperCase() === "VEVENT");
  const event = props.slice(start + 1, end < 0 ? undefined : end);

  const uid = event.find((p) => p.name === "UID")?.value.trim();
  const attendee = event.find((p) => p.name === "ATTENDEE");
  if (!uid || !attendee) return null;
  const partstat = attendee.params.PARTSTAT?.toUpperCase();
  if (partstat !== "ACCEPTED" && partstat !== "DECLINED" && partstat !== "TENTATIVE") return null;
  const address = attendee.value.trim().replace(/^mailto:/i, "").toLowerCase();
  if (!address.includes("@")) return null;
  const stamp = event.find((p) => p.name === "DTSTAMP")?.value;
  return { uid, attendee: address, partstat, answeredAt: stamp ? parseUtc(stamp) : null };
}
