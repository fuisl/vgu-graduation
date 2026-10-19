import type { MailLocale } from "@grad/contract";
import type { StoredEvent } from "../event/event.repository.js";
import type { MailMessage } from "./mailer.js";

/*
 * Guest email copy (ADR-012). Plain text only: it renders the same in every
 * client, has nothing to break on a phone and leaves no tracking pixel to
 * explain. The invitation and RSVP emails go to guests whose language we don't
 * know, so they carry Vietnamese first, then English; the calendar invite is
 * asked for from the site, so it is in the site's language.
 *
 * TODO(owner): the wording is a draft. Review it before the first real send.
 */

const DIVIDER = "\n\n— — —\n\n";

export interface EventLinks {
  /** The public site, e.g. https://grad26.fuisloy.dev. */
  siteUrl: string;
  /** The subscribable calendar feed, so a calendar keeps up when the time is confirmed. */
  webcalUrl: string;
}

function eventName(event: StoredEvent, locale: MailLocale): string {
  return locale === "vi" && event.nameVi ? event.nameVi : event.name;
}

function venueLine(event: StoredEvent, locale: MailLocale): string {
  const address = locale === "vi" && event.venueAddressVi ? event.venueAddressVi : event.venueAddress;
  return `${event.venueName}, ${address}`;
}

/** The ceremony's date, with the clock time only once it is confirmed (#83). */
export function formatWhen(event: StoredEvent, locale: MailLocale): string {
  const intl = locale === "vi" ? "vi-VN" : "en-GB";
  const date = new Intl.DateTimeFormat(intl, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: event.timeZone,
  }).format(event.startsAt);
  if (!event.timeConfirmed) return locale === "vi" ? `${date} (giờ sẽ được xác nhận sau)` : `${date} (time to be confirmed)`;
  const time = new Intl.DateTimeFormat(intl, { hour: "2-digit", minute: "2-digit", timeZone: event.timeZone }).format(
    event.startsAt,
  );
  return `${date}, ${time}`;
}

function signOff(event: StoredEvent, locale: MailLocale): string {
  const contact = event.contactName
    ? locale === "vi"
      ? `Nếu cần hỗ trợ, Quý khách vui lòng liên hệ ${event.contactName}${event.contactEmail ? ` (${event.contactEmail})` : ""}.`
      : `Questions? Contact ${event.contactName}${event.contactEmail ? ` (${event.contactEmail})` : ""}.`
    : null;
  return [contact, "GRAD '26"].filter(Boolean).join("\n\n");
}

/**
 * The invitation link, emailed once when an admin issues or rotates it. The link
 * is a bearer credential: it appears in the body only, never in the subject.
 */
export function invitationEmail(input: {
  to: string;
  givenName: string;
  inviteUrl: string;
  event: StoredEvent;
}): MailMessage {
  const { givenName, inviteUrl, event } = input;
  const vi = [
    `Kính gửi ${givenName},`,
    `Trân trọng kính mời Quý khách đến dự ${eventName(event, "vi")}.`,
    `Thời gian: ${formatWhen(event, "vi")}\nĐịa điểm: ${venueLine(event, "vi")}`,
    `Thiệp mời riêng của Quý khách (xác nhận tham dự, thêm vào lịch, chỉ đường):\n${inviteUrl}`,
    "Đường dẫn này dành riêng cho Quý khách. Xin vui lòng không chia sẻ.",
    signOff(event, "vi"),
  ].join("\n\n");
  const en = [
    `Dear ${givenName},`,
    `You are invited to ${eventName(event, "en")}.`,
    `When: ${formatWhen(event, "en")}\nWhere: ${venueLine(event, "en")}`,
    `Your personal invitation (RSVP, calendar, directions):\n${inviteUrl}`,
    "This link is yours alone. Please don't share it.",
    signOff(event, "en"),
  ].join("\n\n");
  return {
    to: input.to,
    subject: `Thiệp mời | Your invitation: ${eventName(event, "en")}`,
    text: `${vi}${DIVIDER}${en}\n`,
  };
}

/** The calendar invite a guest asks for on the venue page: the .ics plus the feed that keeps it current. */
export function calendarInviteEmail(input: {
  to: string;
  locale: MailLocale;
  event: StoredEvent;
  ics: string;
  links: EventLinks;
}): MailMessage {
  const { locale, event, links } = input;
  const name = eventName(event, locale);
  const text =
    locale === "vi"
      ? [
          `Tệp lịch cho ${name} được đính kèm. Mở tệp để thêm sự kiện vào lịch của Quý khách.`,
          `Thời gian: ${formatWhen(event, locale)}\nĐịa điểm: ${venueLine(event, locale)}`,
          `Để lịch tự cập nhật khi giờ được xác nhận, hãy đăng ký lịch:\n${links.webcalUrl}`,
          `Thông tin sự kiện: ${links.siteUrl}/venue`,
          "Quý khách nhận được email này vì đã yêu cầu trên trang sự kiện.",
          signOff(event, locale),
        ]
      : [
          `The calendar file for ${name} is attached. Open it to add the event to your calendar.`,
          `When: ${formatWhen(event, locale)}\nWhere: ${venueLine(event, locale)}`,
          `To have your calendar update by itself when the time is confirmed, subscribe instead:\n${links.webcalUrl}`,
          `Event details: ${links.siteUrl}/venue`,
          "You received this because it was requested on the event site.",
          signOff(event, locale),
        ];
  return {
    to: input.to,
    subject: locale === "vi" ? `Lịch: ${name}` : `Calendar: ${name}`,
    text: `${text.join("\n\n")}\n`,
    attachments: [{ filename: "grad26.ics", content: input.ics, contentType: "text/calendar; charset=utf-8; method=PUBLISH" }],
  };
}

/**
 * Confirms an RSVP to the guest's stored address. Attendance and plus-ones only:
 * accessibility needs, dietary requirements and notes stay out of the mailbox.
 */
export function rsvpConfirmationEmail(input: {
  to: string;
  givenName: string;
  attending: boolean;
  plusOnesCount: number;
  event: StoredEvent;
  links: EventLinks;
}): MailMessage {
  const { givenName, attending, plusOnesCount, event, links } = input;
  const vi = [
    `Kính gửi ${givenName},`,
    attending
      ? `Cảm ơn Quý khách đã xác nhận tham dự ${eventName(event, "vi")}${plusOnesCount > 0 ? ` cùng ${plusOnesCount} người đi cùng` : ""}.`
      : `Cảm ơn Quý khách đã phản hồi. Chúng tôi rất tiếc vì Quý khách không thể tham dự ${eventName(event, "vi")}.`,
    attending ? `Thời gian: ${formatWhen(event, "vi")}\nĐịa điểm: ${venueLine(event, "vi")}` : null,
    "Quý khách có thể thay đổi câu trả lời bất cứ lúc nào bằng đường dẫn trong thiệp mời.",
    signOff(event, "vi"),
  ];
  const en = [
    `Dear ${givenName},`,
    attending
      ? `Thank you for confirming you will attend ${eventName(event, "en")}${plusOnesCount > 0 ? ` with ${plusOnesCount} guest${plusOnesCount === 1 ? "" : "s"}` : ""}.`
      : `Thank you for letting us know. We're sorry you can't make it to ${eventName(event, "en")}.`,
    attending ? `When: ${formatWhen(event, "en")}\nWhere: ${venueLine(event, "en")}\nDetails: ${links.siteUrl}/venue` : null,
    "You can change your answer any time from the link in your invitation.",
    signOff(event, "en"),
  ];
  const join = (lines: (string | null)[]) => lines.filter(Boolean).join("\n\n");
  return {
    to: input.to,
    subject: attending ? `Đã xác nhận | RSVP confirmed: ${eventName(event, "en")}` : `Đã nhận phản hồi | RSVP received: ${eventName(event, "en")}`,
    text: `${join(vi)}${DIVIDER}${join(en)}\n`,
  };
}
