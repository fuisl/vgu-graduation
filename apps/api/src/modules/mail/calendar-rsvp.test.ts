import { describe, expect, it, vi } from "vitest";
import type { StoredEvent } from "../event/event.repository.js";
import {
  applyCalendarReply,
  firstAuthenticationResults,
  pollCalendarReplies,
  senderAuthenticated,
  type CalendarReplyStore,
  type InboxMessage,
  type MailboxReader,
  type ReplyInvitation,
} from "./calendar-replies.js";
import { buildInviteRequest, invitationIdFromUid, inviteUid, parseCalendarReply } from "./calendar-rsvp.js";
import { escapeHtml, renderHtml, renderText, type EmailContent } from "./layout.js";
import { MailService } from "./mail.service.js";
import { fakeMailer } from "./mailer.fake.js";

const ID = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";
const DOMAIN = "grad26.example.com";
const GUEST = "an.nguyen@gmail.com";
const UID = inviteUid(ID, DOMAIN);

const EVENT: StoredEvent = {
  name: "VGU Graduation Ceremony 2026",
  nameVi: "Lễ Tốt nghiệp VGU 2026",
  startsAt: new Date("2026-11-21T02:00:00Z"),
  endsAt: null,
  timeZone: "Asia/Ho_Chi_Minh",
  timeConfirmed: false,
  venueName: "Ceremony Hall",
  venueAddress: "Ring Road 4, Thu Dau Mot",
  venueAddressVi: null,
  venueMapUrl: "https://maps.example.com/vgu",
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  arrivalInfo: null,
  arrivalInfoVi: null,
  sequence: 4,
  updatedAt: new Date("2026-10-01T00:00:00Z"),
};

/** What Gmail sends back when the guest taps "Yes": folded, with a quoted CN holding a colon. */
function gmailReply(partstat = "ACCEPTED", stamp = "20261020T081500Z", uid = UID, attendee = GUEST) {
  return [
    "BEGIN:VCALENDAR",
    "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:REPLY",
    "BEGIN:VEVENT",
    "DTSTART:20261121T020000Z",
    `DTSTAMP:${stamp}`,
    "ORGANIZER;CN=\"GRAD '26\":mailto:me@gmail.com",
    `UID:${uid}`,
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=${partstat};CN="Nguyễn An: guest";X-NUM-GUESTS=0:mailto:${attendee.slice(0, 5)}`,
    ` ${attendee.slice(5)}`,
    "SEQUENCE:4",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

const GMAIL_AUTH =
  "mx.google.com; dkim=pass header.i=@gmail.com header.s=20230601 header.b=abc; spf=pass (google.com: domain of an.nguyen@gmail.com designates 1.2.3.4 as permitted sender) smtp.mailfrom=an.nguyen@gmail.com; dmarc=pass (p=NONE sp=QUARANTINE dis=NONE) header.from=gmail.com";

describe("the invitation's calendar request", () => {
  it("makes the guest an attendee who can answer, with the organizer's mailbox to answer to", () => {
    const ics = buildInviteRequest({
      event: EVENT,
      invitationId: ID,
      uidDomain: DOMAIN,
      siteUrl: `https://${DOMAIN}`,
      organizer: { email: "me@gmail.com", name: "GRAD '26" },
      attendee: { email: GUEST, name: 'Nguyễn "An"\r\nX-INJECTED:1' },
      now: new Date("2026-10-19T09:00:00Z"),
    });
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("METHOD:REQUEST");
    expect(unfolded).toContain(`UID:${UID}`);
    expect(unfolded).toContain("SEQUENCE:4");
    expect(unfolded).toContain(`ORGANIZER;CN="GRAD '26":mailto:me@gmail.com`);
    expect(unfolded).toContain(`ATTENDEE;CN="Nguyễn AnX-INJECTED:1";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${GUEST}`);
    expect(unfolded.split("\r\n").filter((line) => line.startsWith("X-INJECTED"))).toHaveLength(0);
    expect(unfolded).toContain("STATUS:TENTATIVE");
  });

  it("is attached by MailService only when calendar RSVP is on", async () => {
    const on = fakeMailer();
    const mail = new MailService(on.mailer, { get: async () => EVENT }, {
      publicOrigin: `https://${DOMAIN}`,
      apiOrigin: `https://api.${DOMAIN}`,
      mail: { calendarRsvp: true, user: "me@gmail.com" },
    });
    await mail.sendInvitation({ to: GUEST, givenName: "An", inviteUrl: `https://${DOMAIN}/invite/t`, invitationId: ID, guestName: "Nguyễn An" });
    expect(on.sent[0].calendarRequest).toContain(`mailto:${GUEST}`);
    expect(on.sent[0].text).toContain("Yes / Maybe / No");
    expect(on.sent[0].html).toContain("Open your invitation");

    const off = fakeMailer();
    await new MailService(off.mailer, { get: async () => EVENT }, { publicOrigin: `https://${DOMAIN}`, apiOrigin: `https://api.${DOMAIN}` })
      .sendInvitation({ to: GUEST, givenName: "An", inviteUrl: `https://${DOMAIN}/invite/t`, invitationId: ID, guestName: "Nguyễn An" });
    expect(off.sent[0].calendarRequest).toBeUndefined();
    expect(off.sent[0].text).not.toContain("Yes / Maybe / No");
  });
});

describe("parseCalendarReply", () => {
  it("reads Gmail's folded REPLY, quotes and all", () => {
    expect(parseCalendarReply(gmailReply())).toEqual({
      uid: UID,
      attendee: GUEST,
      partstat: "ACCEPTED",
      answeredAt: new Date("2026-10-20T08:15:00Z"),
    });
  });

  it("ignores requests, unanswered and malformed replies", () => {
    expect(parseCalendarReply(gmailReply().replace("METHOD:REPLY", "METHOD:REQUEST"))).toBeNull();
    expect(parseCalendarReply(gmailReply("NEEDS-ACTION"))).toBeNull();
    expect(parseCalendarReply("not a calendar")).toBeNull();
  });

  it("maps a UID back to the invitation only for our domain", () => {
    expect(invitationIdFromUid(UID, DOMAIN)).toBe(ID);
    expect(invitationIdFromUid(inviteUid(ID, "evil.example.com"), DOMAIN)).toBeNull();
    expect(invitationIdFromUid("event-1@grad26.example.com", DOMAIN)).toBeNull();
  });
});

describe("senderAuthenticated", () => {
  it("trusts the receiving server's DMARC or aligned DKIM pass", () => {
    expect(senderAuthenticated(GMAIL_AUTH, "mx.google.com", GUEST)).toBe(true);
    expect(senderAuthenticated("mx.google.com; dkim=pass header.i=@mail.school.edu.vn", "mx.google.com", "a@school.edu.vn")).toBe(true);
  });

  it("refuses another server's header, failures and unaligned signatures", () => {
    expect(senderAuthenticated(GMAIL_AUTH.replace("mx.google.com", "attacker.example"), "mx.google.com", GUEST)).toBe(false);
    expect(senderAuthenticated("mx.google.com; dkim=fail header.i=@gmail.com; dmarc=fail header.from=gmail.com", "mx.google.com", GUEST)).toBe(false);
    expect(senderAuthenticated("mx.google.com; dkim=pass header.i=@attacker.example", "mx.google.com", GUEST)).toBe(false);
    expect(senderAuthenticated(null, "mx.google.com", GUEST)).toBe(false);
  });

  it("reads the topmost Authentication-Results header only", () => {
    const headers = Buffer.from(`Authentication-Results: mx.google.com;\r\n  dkim=pass header.i=@gmail.com\r\nAuthentication-Results: mx.google.com; dkim=fail\r\n`);
    expect(firstAuthenticationResults(headers)).toBe("mx.google.com; dkim=pass header.i=@gmail.com");
  });
});

describe("applyCalendarReply", () => {
  const now = new Date("2026-10-21T00:00:00Z");
  function store(invitation: ReplyInvitation | null) {
    const applyAttendance = vi.fn(async () => undefined);
    return { findInvitation: async () => invitation, applyAttendance };
  }
  const active = (overrides: Partial<ReplyInvitation> = {}): ReplyInvitation => ({
    guestEmail: "An.Nguyen@gmail.com",
    status: "active",
    validUntil: null,
    rsvp: null,
    ...overrides,
  });
  const message = { from: GUEST, authenticationResults: GMAIL_AUTH };
  const run = (reply: string, s: ReturnType<typeof store>, msg = message) =>
    applyCalendarReply(parseCalendarReply(reply)!, msg, { store: s, uidDomain: DOMAIN, authservId: "mx.google.com", now });

  it("records Yes as attending and No as not attending", async () => {
    const yes = store(active());
    expect(await run(gmailReply("ACCEPTED"), yes)).toEqual({ outcome: "applied", invitationId: ID });
    expect(yes.applyAttendance).toHaveBeenCalledWith(ID, true);
    const no = store(active({ rsvp: { attending: true, updatedAt: new Date("2026-10-19T00:00:00Z") } }));
    expect((await run(gmailReply("DECLINED"), no)).outcome).toBe("applied");
    expect(no.applyAttendance).toHaveBeenCalledWith(ID, false);
  });

  it("leaves the RSVP alone for Maybe, a newer site answer or the same answer", async () => {
    const s = store(active({ rsvp: { attending: true, updatedAt: new Date("2026-10-20T09:00:00Z") } }));
    expect((await run(gmailReply("TENTATIVE"), s)).outcome).toBe("maybe");
    expect((await run(gmailReply("DECLINED"), s)).outcome).toBe("stale");
    const same = store(active({ rsvp: { attending: true, updatedAt: new Date("2026-10-19T00:00:00Z") } }));
    expect((await run(gmailReply("ACCEPTED"), same)).outcome).toBe("unchanged");
    expect(s.applyAttendance).not.toHaveBeenCalled();
    expect(same.applyAttendance).not.toHaveBeenCalled();
  });

  it("only takes an answer from the invited guest's own authenticated address", async () => {
    const s = store(active());
    expect((await run(gmailReply(), s, { from: "someone@gmail.com", authenticationResults: GMAIL_AUTH })).outcome).toBe("wrong_attendee");
    expect((await run(gmailReply(), s, { from: GUEST, authenticationResults: "mx.google.com; dkim=fail" })).outcome).toBe("unauthenticated");
    const other = gmailReply("ACCEPTED", "20261020T081500Z", UID, "other@gmail.com");
    expect((await run(other, s, { from: "other@gmail.com", authenticationResults: GMAIL_AUTH })).outcome).toBe("wrong_attendee");
    expect((await run(gmailReply(), store(active({ status: "revoked" })))).outcome).toBe("inactive");
    expect((await run(gmailReply(), store(active({ validUntil: new Date("2026-10-20T00:00:00Z") })))).outcome).toBe("inactive");
    expect((await run(gmailReply("ACCEPTED", "20261020T081500Z", inviteUid(ID, "evil.example.com")), s)).outcome).toBe("not_ours");
    expect(s.applyAttendance).not.toHaveBeenCalled();
  });
});

describe("pollCalendarReplies", () => {
  function fakeStore(cursor: { uidValidity: number; lastUid: number } | null) {
    const saved: [number, number][] = [];
    const store: CalendarReplyStore = {
      getCursor: async () => cursor,
      saveCursor: async (_m, v, uid) => void saved.push([v, uid]),
      findInvitation: async () => ({ guestEmail: GUEST, status: "active", validUntil: null, rsvp: null }),
      applyAttendance: vi.fn(async () => undefined),
    };
    return { store, saved };
  }
  const logger = { info: vi.fn(), error: vi.fn() };
  const reader = (messages: InboxMessage[], uidValidity = 7, uidNext = 100): MailboxReader => ({
    read: async () => ({ uidValidity, uidNext, messages }),
  });

  it("applies replies and moves the cursor past every message, calendar or not", async () => {
    const { store, saved } = fakeStore({ uidValidity: 7, lastUid: 40 });
    const counts = await pollCalendarReplies({
      reader: reader([
        { uid: 41, from: "news@example.com", authenticationResults: null, calendarParts: [] },
        { uid: 42, from: GUEST, authenticationResults: GMAIL_AUTH, calendarParts: [gmailReply()] },
      ]),
      store,
      uidDomain: DOMAIN,
      authservId: "mx.google.com",
      logger,
    });
    expect(counts).toEqual({ messages: 2, applied: 1 });
    expect(saved).toEqual([[7, 41], [7, 42]]);
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(GUEST);
  });

  it("starts at the end of the mailbox on a first run with nothing recent", async () => {
    const { store, saved } = fakeStore(null);
    await pollCalendarReplies({ reader: reader([], 9, 500), store, uidDomain: DOMAIN, authservId: "mx.google.com", logger });
    expect(saved).toEqual([[9, 499]]);
  });
});

describe("email layout", () => {
  const content: EmailContent = {
    subject: "Hi",
    preheader: "Preview",
    title: "<b>Title</b>",
    sections: [
      {
        lang: "en",
        greeting: "Dear <script>alert(1)</script>,",
        paragraphs: ["See https://grad26.example.com/venue for more."],
        facts: [["When", "Saturday"]],
        cta: { label: "Open", href: "javascript:alert(1)" },
        signOff: ["GRAD '26"],
      },
    ],
    siteUrl: "https://grad26.example.com",
  };

  it("escapes every text and drops non-web links", () => {
    const html = renderHtml(content);
    expect(html).not.toContain("<script>");
    expect(html).toContain(escapeHtml("<script>alert(1)</script>"));
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="https://grad26.example.com/venue"');
    expect(html).toContain("#1f4bb0");
  });

  it("renders the same content as plain text", () => {
    const text = renderText({ ...content, sections: [{ ...content.sections[0]!, cta: { label: "Open", href: "https://grad26.example.com/invite/t" } }] });
    expect(text).toContain("When: Saturday");
    expect(text).toContain("Open:\nhttps://grad26.example.com/invite/t");
  });
});
