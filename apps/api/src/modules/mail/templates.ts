import type { MailLocale } from "@grad/contract";
import type { StoredEvent } from "../event/event.repository.js";
import { renderHtml, renderText, type EmailContent, type EmailSection } from "./layout.js";
import type { MailMessage } from "./mailer.js";

/*
 * Guest email copy (ADR-012, ADR-013). Each email is a list of language
 * sections rendered twice by layout.ts: branded HTML and plain text. The
 * invitation and RSVP emails go to guests whose language we don't know, so they
 * carry English first, then Vietnamese (owner decision 2026-10-30); the calendar
 * invite is asked for from the site, so it is in the site's language.
 *
 * TODO(owner): the wording is a draft. Review it before the first real send.
 */

export interface EventLinks {
  /** The public site, e.g. https://grad26.fuisloy.dev. */
  siteUrl: string;
  /** The subscribable calendar feed, so a calendar keeps up when the time is confirmed. */
  webcalUrl: string;
}

const LABELS = {
  vi: { when: "Thời gian", where: "Địa điểm" },
  en: { when: "When", where: "Where" },
} as const;

function eventName(event: StoredEvent, locale: MailLocale): string {
  return locale === "vi" && event.nameVi ? event.nameVi : event.name;
}

function venueLine(event: StoredEvent, locale: MailLocale): string {
  const address = locale === "vi" && event.venueAddressVi ? event.venueAddressVi : event.venueAddress;
  return `${event.venueName}, ${address}`;
}

function facts(event: StoredEvent, locale: MailLocale): [string, string][] {
  return [
    [LABELS[locale].when, formatWhen(event, locale)],
    [LABELS[locale].where, venueLine(event, locale)],
  ];
}

/** The ceremony's date, with the clock time (start to end) only once it is confirmed (#83). */
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
  const clock = new Intl.DateTimeFormat(intl, { hour: "2-digit", minute: "2-digit", timeZone: event.timeZone });
  const time = event.endsAt ? clock.formatRange(event.startsAt, event.endsAt) : clock.format(event.startsAt);
  return `${date}, ${time}`;
}

function signOff(event: StoredEvent, locale: MailLocale): string[] {
  const contact = event.contactName
    ? locale === "vi"
      ? `Nếu cần hỗ trợ, Quý khách vui lòng liên hệ ${event.contactName}${event.contactEmail ? ` (${event.contactEmail})` : ""}.`
      : `Questions? Contact ${event.contactName}${event.contactEmail ? ` (${event.contactEmail})` : ""}.`
    : null;
  return [contact, "GRAD '26"].filter((line): line is string => Boolean(line));
}

function message(to: string, content: EmailContent, extra: Partial<MailMessage> = {}): MailMessage {
  return { to, subject: content.subject, text: renderText(content), html: renderHtml(content), ...extra };
}

/**
 * The invitation link, emailed once when an admin issues or rotates it. The link
 * is a bearer credential: it appears in the body only, never in the subject.
 * With `calendarRequest` (ADR-013) the email is also a calendar invitation the
 * guest can answer with their mail app's Yes / Maybe / No.
 */
export function invitationEmail(input: {
  to: string;
  givenName: string;
  inviteUrl: string;
  event: StoredEvent;
  siteUrl: string;
  calendarRequest?: string;
}): MailMessage {
  const { givenName, inviteUrl, event } = input;
  const rsvpByCalendar = Boolean(input.calendarRequest);
  const vi: EmailSection = {
    lang: "vi",
    greeting: `Kính gửi ${givenName},`,
    paragraphs: [
      `Trân trọng kính mời Quý khách đến dự ${eventName(event, "vi")}.`,
      rsvpByCalendar
        ? "Quý khách có thể trả lời ngay bằng nút Có / Có thể / Không của ứng dụng email hoặc lịch (Gmail, Outlook, Apple Mail), hoặc trên thiệp mời riêng bên dưới, nơi Quý khách có thể báo thêm người đi cùng."
        : "Thiệp mời riêng của Quý khách có phần xác nhận tham dự, thêm vào lịch và chỉ đường.",
    ],
    facts: facts(event, "vi"),
    cta: { label: "Mở thiệp mời", href: inviteUrl },
    notes: [
      "Đường dẫn này dành riêng cho Quý khách. Xin vui lòng không chia sẻ.",
      ...(rsvpByCalendar ? ["Câu trả lời “Có thể” chưa được tính là xác nhận tham dự."] : []),
    ],
    signOff: signOff(event, "vi"),
  };
  const en: EmailSection = {
    lang: "en",
    greeting: `Dear ${givenName},`,
    paragraphs: [
      `You are invited to ${eventName(event, "en")}.`,
      rsvpByCalendar
        ? "Reply straight from your mail or calendar app with Yes / Maybe / No (Gmail, Outlook, Apple Mail), or on your personal invitation below, where you can also add guests."
        : "Your personal invitation has your RSVP, the calendar and directions.",
    ],
    facts: facts(event, "en"),
    cta: { label: "Open your invitation", href: inviteUrl },
    notes: [
      "This link is yours alone. Please don't share it.",
      ...(rsvpByCalendar ? ["“Maybe” doesn't count as an RSVP yet."] : []),
    ],
    signOff: signOff(event, "en"),
  };
  const content: EmailContent = {
    subject: `Your invitation | Thiệp mời: ${eventName(event, "en")}`,
    preheader: `${eventName(event, "en")} · ${formatWhen(event, "en")}`,
    title: eventName(event, "en"),
    subtitle: formatWhen(event, "en"),
    sections: [en, vi],
    siteUrl: input.siteUrl,
  };
  return message(input.to, content, input.calendarRequest ? { calendarRequest: input.calendarRequest } : {});
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
  const section: EmailSection =
    locale === "vi"
      ? {
          lang: "vi",
          paragraphs: [`Tệp lịch cho ${name} được đính kèm. Mở tệp để thêm sự kiện vào lịch của Quý khách.`],
          facts: facts(event, locale),
          cta: { label: "Thông tin sự kiện", href: `${links.siteUrl}/venue` },
          notes: [
            `Để lịch tự cập nhật khi giờ được xác nhận, hãy đăng ký lịch: ${links.webcalUrl}`,
            "Quý khách nhận được email này vì đã yêu cầu trên trang sự kiện.",
          ],
          signOff: signOff(event, locale),
        }
      : {
          lang: "en",
          paragraphs: [`The calendar file for ${name} is attached. Open it to add the event to your calendar.`],
          facts: facts(event, locale),
          cta: { label: "Event details", href: `${links.siteUrl}/venue` },
          notes: [
            `To have your calendar update by itself when the time is confirmed, subscribe instead: ${links.webcalUrl}`,
            "You received this because it was requested on the event site.",
          ],
          signOff: signOff(event, locale),
        };
  const content: EmailContent = {
    subject: locale === "vi" ? `Lịch: ${name}` : `Calendar: ${name}`,
    preheader: formatWhen(event, locale),
    title: name,
    subtitle: formatWhen(event, locale),
    sections: [section],
    siteUrl: links.siteUrl,
  };
  return message(input.to, content, {
    attachments: [{ filename: "grad26.ics", content: input.ics, contentType: "text/calendar; charset=utf-8; method=PUBLISH" }],
  });
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
  const vi: EmailSection = {
    lang: "vi",
    greeting: `Kính gửi ${givenName},`,
    paragraphs: [
      attending
        ? `Cảm ơn Quý khách đã xác nhận tham dự ${eventName(event, "vi")}${plusOnesCount > 0 ? ` cùng ${plusOnesCount} người đi cùng` : ""}.`
        : `Cảm ơn Quý khách đã phản hồi. Chúng tôi rất tiếc vì Quý khách không thể tham dự ${eventName(event, "vi")}.`,
    ],
    facts: attending ? facts(event, "vi") : undefined,
    cta: attending ? { label: "Thông tin sự kiện", href: `${links.siteUrl}/venue` } : undefined,
    notes: ["Quý khách có thể thay đổi câu trả lời bất cứ lúc nào bằng đường dẫn trong thiệp mời."],
    signOff: signOff(event, "vi"),
  };
  const en: EmailSection = {
    lang: "en",
    greeting: `Dear ${givenName},`,
    paragraphs: [
      attending
        ? `Thank you for confirming you will attend ${eventName(event, "en")}${plusOnesCount > 0 ? ` with ${plusOnesCount} guest${plusOnesCount === 1 ? "" : "s"}` : ""}.`
        : `Thank you for letting us know. We're sorry you can't make it to ${eventName(event, "en")}.`,
    ],
    facts: attending ? facts(event, "en") : undefined,
    cta: attending ? { label: "Event details", href: `${links.siteUrl}/venue` } : undefined,
    notes: ["You can change your answer any time from the link in your invitation."],
    signOff: signOff(event, "en"),
  };
  const content: EmailContent = {
    subject: attending
      ? `RSVP confirmed | Đã xác nhận: ${eventName(event, "en")}`
      : `RSVP received | Đã nhận phản hồi: ${eventName(event, "en")}`,
    preheader: attending ? "See you there! · Hẹn gặp Quý khách!" : "Thank you for letting us know · Cảm ơn Quý khách",
    title: eventName(event, "en"),
    subtitle: formatWhen(event, "en"),
    sections: [en, vi],
    siteUrl: links.siteUrl,
  };
  return message(input.to, content);
}
