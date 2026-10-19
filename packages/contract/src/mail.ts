import { z } from "zod";

/**
 * How one guest email went (ADR-012). `sent` means the SMTP server accepted it,
 * not that it reached the inbox. `no_address` is a guest with no stored email;
 * `not_configured` is an API without SMTP credentials.
 */
export const emailStatusSchema = z.enum(["sent", "failed", "not_configured", "no_address"]);
export type EmailStatus = z.infer<typeof emailStatusSchema>;

/** GET /mail/status: whether the API can send guest email at all. Public, no personal data. */
export const mailStatusResponseSchema = z.object({ enabled: z.boolean() });
export type MailStatusResponse = z.infer<typeof mailStatusResponseSchema>;

/** The languages a guest email is written in, matching the site's (#9). */
export const mailLocaleSchema = z.enum(["en", "vi"]);
export type MailLocale = z.infer<typeof mailLocaleSchema>;

/**
 * POST /calendar/email: mails the calendar invite (.ics) to an address the guest
 * types. Needs an invitation credential and is rate-limited per invitation, so it
 * can't be used to send mail to strangers. The address is used once and never
 * stored or logged.
 */
export const calendarEmailRequestSchema = z.object({
  email: z.string().trim().email().max(254),
  locale: mailLocaleSchema.default("en"),
});
export type CalendarEmailRequest = z.infer<typeof calendarEmailRequestSchema>;

/** POST /calendar/email: 200 response. 503 when mail is off, 429 over the limit, 502 when SMTP refused it. */
export const calendarEmailResponseSchema = z.object({ status: z.literal("sent") });
export type CalendarEmailResponse = z.infer<typeof calendarEmailResponseSchema>;

/** Calendar invites one invitation may send in `CALENDAR_EMAIL_WINDOW_MS`. */
export const CALENDAR_EMAIL_LIMIT = 5;
export const CALENDAR_EMAIL_WINDOW_MS = 24 * 60 * 60 * 1000;
