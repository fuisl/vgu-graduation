import { eq, sql } from "drizzle-orm";
import { ImapFlow, type MessageStructureObject } from "imapflow";
import type pg from "pg";
import { config as defaultConfig, type Config } from "../../config.js";
import { db } from "../../db/index.js";
import { guests, invitations, mailCursors, rsvp } from "../../db/schema.js";
import { invitationIdFromUid, parseCalendarReply, type CalendarReply } from "./calendar-rsvp.js";
import { eventLinks } from "./mail.service.js";

/*
 * Reads calendar RSVP replies (ADR-013). The worker polls the organizer's INBOX
 * read-only (EXAMINE: no flag or message changes), looks only at messages newer
 * than its cursor, downloads only their text/calendar parts, and turns a valid
 * REPLY into an RSVP. Nothing about a message (sender, subject, body) is stored
 * or logged: only counts and invitation ids.
 */

const MAILBOX = "INBOX";
/** On the very first run, look back this far rather than at the whole mailbox. */
const FIRST_RUN_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
/** A calendar part is a few kilobytes; anything bigger is not a reply we sent for. */
const MAX_PART_BYTES = 256 * 1024;
const MAX_MESSAGES_PER_POLL = 200;

/** One new message, reduced to what the reply check needs. */
export interface InboxMessage {
  uid: number;
  /** The From address, lower-cased. */
  from: string | null;
  /** The topmost Authentication-Results header value, added by the receiving server. */
  authenticationResults: string | null;
  calendarParts: string[];
}

export interface MailboxReader {
  /**
   * New messages after `lastUid` (or since `since` on a first run or after UIDVALIDITY changed),
   * oldest first, with the mailbox's UIDVALIDITY and UIDNEXT.
   */
  read(
    cursor: { uidValidity: number; lastUid: number } | null,
    since: Date,
  ): Promise<{ uidValidity: number; uidNext: number; messages: InboxMessage[] }>;
}

export interface ReplyInvitation {
  guestEmail: string | null;
  status: "active" | "revoked";
  validUntil: Date | null;
  rsvp: { attending: boolean; updatedAt: Date } | null;
}

export interface CalendarReplyStore {
  getCursor(mailbox: string): Promise<{ uidValidity: number; lastUid: number } | null>;
  saveCursor(mailbox: string, uidValidity: number, lastUid: number): Promise<void>;
  findInvitation(invitationId: string): Promise<ReplyInvitation | null>;
  /** Records attendance; a decline also clears plus-ones. Other RSVP fields stay as they are. */
  applyAttendance(invitationId: string, attending: boolean): Promise<void>;
}

export class CalendarReplyRepository implements CalendarReplyStore {
  constructor(private readonly database: typeof db = db) {}

  async getCursor(mailbox: string) {
    const [row] = await this.database
      .select({ uidValidity: mailCursors.uidValidity, lastUid: mailCursors.lastUid })
      .from(mailCursors)
      .where(eq(mailCursors.mailbox, mailbox));
    return row ?? null;
  }

  async saveCursor(mailbox: string, uidValidity: number, lastUid: number) {
    await this.database
      .insert(mailCursors)
      .values({ mailbox, uidValidity, lastUid })
      .onConflictDoUpdate({ target: mailCursors.mailbox, set: { uidValidity, lastUid } });
  }

  async findInvitation(invitationId: string): Promise<ReplyInvitation | null> {
    const [row] = await this.database
      .select({
        guestEmail: guests.email,
        status: invitations.status,
        validUntil: invitations.validUntil,
        attending: rsvp.attending,
        rsvpUpdatedAt: rsvp.updatedAt,
      })
      .from(invitations)
      .innerJoin(guests, eq(guests.id, invitations.guestId))
      .leftJoin(rsvp, eq(rsvp.invitationId, invitations.id))
      .where(eq(invitations.id, invitationId))
      .limit(1);
    if (!row) return null;
    return {
      guestEmail: row.guestEmail,
      status: row.status,
      validUntil: row.validUntil,
      rsvp: row.attending === null || !row.rsvpUpdatedAt ? null : { attending: row.attending, updatedAt: row.rsvpUpdatedAt },
    };
  }

  async applyAttendance(invitationId: string, attending: boolean) {
    await this.database
      .insert(rsvp)
      .values({ invitationId, attending, plusOnesCount: 0 })
      .onConflictDoUpdate({
        target: rsvp.invitationId,
        set: {
          attending,
          plusOnesCount: attending ? sql`${rsvp.plusOnesCount}` : 0,
          updatedAt: sql`now()`,
        },
      });
  }
}

function domainOf(address: string): string {
  return address.slice(address.lastIndexOf("@") + 1).toLowerCase();
}

/** True when `domain` is `expected` or a subdomain of it (relaxed DMARC alignment). */
function aligned(domain: string, expected: string): boolean {
  const d = domain.toLowerCase().replace(/^@/, "");
  return d === expected || d.endsWith(`.${expected}`) || expected.endsWith(`.${d}`);
}

/**
 * Whether the receiving server vouched for the sender's domain: DMARC passed for
 * it, or a DKIM signature from it verified. Only a header from `authservId`
 * counts; one written by the sender would name another server or sit below it.
 */
export function senderAuthenticated(authenticationResults: string | null, authservId: string, from: string): boolean {
  if (!authenticationResults) return false;
  const [server, ...results] = authenticationResults.replace(/\r?\n[ \t]+/g, " ").split(";");
  if (server?.trim().split(/\s+/)[0]?.toLowerCase() !== authservId.toLowerCase()) return false;
  const fromDomain = domainOf(from);
  return results.some((raw) => {
    const result = raw.trim().toLowerCase();
    if (/^dmarc=pass\b/.test(result)) {
      const header = /header\.from=([^\s;]+)/.exec(result)?.[1];
      return header !== undefined && aligned(header, fromDomain);
    }
    if (/^dkim=pass\b/.test(result)) {
      const signer = /header\.(?:d|i)=([^\s;]+)/.exec(result)?.[1];
      return signer !== undefined && aligned(signer.slice(signer.lastIndexOf("@") + 1), fromDomain);
    }
    return false;
  });
}

export type ReplyOutcome =
  | "applied"
  | "unchanged"
  | "maybe"
  | "stale"
  | "not_ours"
  | "unauthenticated"
  | "wrong_attendee"
  | "inactive";

/**
 * Decides what one REPLY does. Only the guest the invitation was mailed to can
 * answer it, from their own authenticated address. "Maybe" changes nothing, and
 * an answer older than the RSVP already saved on the site loses.
 */
export async function applyCalendarReply(
  reply: CalendarReply,
  message: Pick<InboxMessage, "from" | "authenticationResults">,
  deps: { store: Pick<CalendarReplyStore, "findInvitation" | "applyAttendance">; uidDomain: string; authservId: string; now: Date },
): Promise<{ outcome: ReplyOutcome; invitationId?: string }> {
  const invitationId = invitationIdFromUid(reply.uid, deps.uidDomain);
  if (!invitationId) return { outcome: "not_ours" };
  if (!message.from || message.from !== reply.attendee) return { outcome: "wrong_attendee", invitationId };
  if (!senderAuthenticated(message.authenticationResults, deps.authservId, message.from)) {
    return { outcome: "unauthenticated", invitationId };
  }
  const invitation = await deps.store.findInvitation(invitationId);
  if (!invitation || invitation.status !== "active" || (invitation.validUntil && invitation.validUntil <= deps.now)) {
    return { outcome: "inactive", invitationId };
  }
  if (!invitation.guestEmail || invitation.guestEmail.toLowerCase() !== reply.attendee) {
    return { outcome: "wrong_attendee", invitationId };
  }
  if (reply.partstat === "TENTATIVE") return { outcome: "maybe", invitationId };
  const attending = reply.partstat === "ACCEPTED";
  if (invitation.rsvp) {
    if (reply.answeredAt && reply.answeredAt <= invitation.rsvp.updatedAt) return { outcome: "stale", invitationId };
    if (invitation.rsvp.attending === attending) return { outcome: "unchanged", invitationId };
  }
  await deps.store.applyAttendance(invitationId, attending);
  return { outcome: "applied", invitationId };
}

export interface PollLogger {
  info(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

/**
 * One pass over new mail: applies every calendar reply, then advances the
 * cursor past each message, so a crash re-reads at most one message (and
 * applying a reply twice changes nothing).
 */
export async function pollCalendarReplies(deps: {
  reader: MailboxReader;
  store: CalendarReplyStore;
  uidDomain: string;
  authservId: string;
  logger: PollLogger;
  now?: () => Date;
}): Promise<Record<string, number>> {
  const now = deps.now ?? (() => new Date());
  const cursor = await deps.store.getCursor(MAILBOX);
  const { uidValidity, uidNext, messages } = await deps.reader.read(
    cursor,
    new Date(now().getTime() - FIRST_RUN_LOOKBACK_MS),
  );
  const counts: Record<string, number> = { messages: messages.length };
  const fresh = !cursor || cursor.uidValidity !== uidValidity;
  let lastUid = fresh ? 0 : cursor.lastUid;

  for (const message of messages) {
    for (const part of message.calendarParts) {
      const reply = parseCalendarReply(part);
      if (!reply) continue;
      const { outcome, invitationId } = await applyCalendarReply(reply, message, {
        store: deps.store,
        uidDomain: deps.uidDomain,
        authservId: deps.authservId,
        now: now(),
      });
      counts[outcome] = (counts[outcome] ?? 0) + 1;
      if (invitationId && outcome !== "not_ours") deps.logger.info({ invitationId, outcome }, "calendar reply");
    }
    lastUid = Math.max(lastUid, message.uid);
    await deps.store.saveCursor(MAILBOX, uidValidity, lastUid);
  }
  // A first run that found nothing recent starts from the mailbox's end, not its beginning.
  if (messages.length === 0 && fresh) await deps.store.saveCursor(MAILBOX, uidValidity, Math.max(uidNext - 1, 0));
  return counts;
}

function calendarPartIds(node: MessageStructureObject | undefined, out: string[] = []): string[] {
  if (!node) return out;
  const type = node.type?.toLowerCase();
  if ((type === "text/calendar" || type === "application/ics") && (node.size ?? 0) <= MAX_PART_BYTES) {
    out.push(node.part ?? "1");
  }
  for (const child of node.childNodes ?? []) calendarPartIds(child, out);
  return out;
}

/** The value of the first (topmost) Authentication-Results header in a raw header block. */
export function firstAuthenticationResults(headers: Buffer | undefined): string | null {
  if (!headers) return null;
  const unfolded = headers.toString("utf8").replace(/\r?\n[ \t]+/g, " ");
  const match = /^authentication-results:\s*(.*)$/im.exec(unfolded);
  return match ? match[1]!.trim() : null;
}

/** The IMAP mailbox reader: Gmail by default, read-only, TLS on 993. */
export class ImapMailboxReader implements MailboxReader {
  constructor(private readonly mail: Config["mail"] = defaultConfig.mail) {}

  async read(cursor: { uidValidity: number; lastUid: number } | null, since: Date) {
    const client = new ImapFlow({
      host: this.mail.imapHost,
      port: this.mail.imapPort,
      secure: true,
      auth: { user: this.mail.user!, pass: this.mail.password! },
      // imapflow's logger prints commands and envelopes (addresses): keep it off.
      logger: false,
    });
    await client.connect();
    try {
      const lock = await client.getMailboxLock(MAILBOX, { readOnly: true });
      try {
        const mailbox = client.mailbox;
        if (!mailbox) throw new Error("mailbox did not open");
        const uidValidity = Number(mailbox.uidValidity);
        const fresh = !cursor || cursor.uidValidity !== uidValidity;
        let uids: number[];
        if (fresh) {
          const found = await client.search({ since }, { uid: true });
          uids = Array.isArray(found) ? found : [];
        } else {
          const next = cursor.lastUid + 1;
          if (next >= mailbox.uidNext) return { uidValidity, uidNext: mailbox.uidNext, messages: [] };
          const found = await client.search({ uid: `${next}:*` }, { uid: true });
          uids = (Array.isArray(found) ? found : []).filter((uid) => uid > cursor.lastUid);
        }
        uids = uids.sort((a, b) => a - b).slice(0, MAX_MESSAGES_PER_POLL);
        if (uids.length === 0) return { uidValidity, uidNext: mailbox.uidNext, messages: [] };

        const found: { uid: number; from: string | null; authenticationResults: string | null; parts: string[] }[] = [];
        for await (const msg of client.fetch(
          uids.join(","),
          { uid: true, envelope: true, bodyStructure: true, headers: ["authentication-results"] },
          { uid: true },
        )) {
          found.push({
            uid: msg.uid,
            from: msg.envelope?.from?.[0]?.address?.toLowerCase() ?? null,
            authenticationResults: firstAuthenticationResults(msg.headers),
            parts: calendarPartIds(msg.bodyStructure),
          });
        }
        const messages: InboxMessage[] = [];
        for (const msg of found.sort((a, b) => a.uid - b.uid)) {
          let calendarParts: string[] = [];
          if (msg.parts.length > 0) {
            const downloaded = await client.downloadMany(String(msg.uid), msg.parts, { uid: true });
            calendarParts = Object.values(downloaded)
              .map((part) => part.content?.toString("utf8"))
              .filter((text): text is string => Boolean(text));
          }
          messages.push({ uid: msg.uid, from: msg.from, authenticationResults: msg.authenticationResults, calendarParts });
        }
        return { uidValidity, uidNext: mailbox.uidNext, messages };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => client.close());
    }
  }
}

/** Only one worker replica polls at a time: a session advisory lock held for the pass. */
const POLL_LOCK_KEY = 0x67726164; // "grad"

/** Polls every `intervalMs` until `signal` aborts. Mail errors are logged as a code and retried next round. */
export async function runCalendarReplyPoller(options: {
  pool: pg.Pool;
  signal: AbortSignal;
  logger: PollLogger;
  mail?: Config["mail"];
  config?: Pick<Config, "publicOrigin" | "apiOrigin">;
  reader?: MailboxReader;
  store?: CalendarReplyStore;
}): Promise<void> {
  const mail = options.mail ?? defaultConfig.mail;
  const { uidDomain } = eventLinks(options.config ?? defaultConfig);
  const reader = options.reader ?? new ImapMailboxReader(mail);
  const store = options.store ?? new CalendarReplyRepository();

  while (!options.signal.aborted) {
    const client = await options.pool.connect().catch(() => null);
    if (client) {
      try {
        const { rows } = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked", [POLL_LOCK_KEY]);
        if (rows[0]?.locked) {
          try {
            const counts = await pollCalendarReplies({ reader, store, uidDomain, authservId: mail.authservId, logger: options.logger });
            if (counts.messages) options.logger.info(counts, "calendar replies polled");
          } finally {
            await client.query("SELECT pg_advisory_unlock($1)", [POLL_LOCK_KEY]);
          }
        }
      } catch (error) {
        const code = (error as { code?: unknown; authenticationFailed?: unknown } | null) ?? {};
        options.logger.error(
          { error: typeof code.code === "string" ? code.code : code.authenticationFailed ? "AUTHENTICATIONFAILED" : "POLL_FAILED" },
          "calendar reply poll failed",
        );
      } finally {
        client.release();
      }
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(done, mail.replyPollMs);
      function done() {
        clearTimeout(timer);
        options.signal.removeEventListener("abort", done);
        resolve();
      }
      options.signal.addEventListener("abort", done, { once: true });
    });
  }
}
