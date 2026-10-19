import { mailStatusResponseSchema, type MailLocale } from "@grad/contract";
import { apiFetch } from "./client";

/**
 * GET /mail/status (ADR-012): whether the API can send guest email. Revalidated
 * every minute; any failure reads as "off", so an email form only shows when it
 * can really send.
 */
export async function isMailEnabled(): Promise<boolean> {
  try {
    const response = await apiFetch("/mail/status", { cache: { mode: "revalidate", seconds: 60, tags: ["mail"] } });
    if (!response.ok) return false;
    const parsed = mailStatusResponseSchema.safeParse(await response.json());
    return parsed.success && parsed.data.enabled;
  } catch {
    return false;
  }
}

/** How a calendar invite request went, as the venue form shows it. */
export type CalendarEmailOutcome = "sent" | "invalid" | "limited" | "no_invitation" | "unavailable" | "failed";

/**
 * POST /calendar/email with the guest's invitation credential. Never cached and
 * never logged: the body carries an address the guest typed.
 */
export async function sendCalendarEmail(token: string, email: string, locale: MailLocale): Promise<CalendarEmailOutcome> {
  let response: Response;
  try {
    response = await apiFetch("/calendar/email", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, locale }),
      cache: { mode: "no-store" },
    });
  } catch {
    return "failed";
  }
  if (response.ok) return "sent";
  switch (response.status) {
    case 400:
      return "invalid";
    case 401:
    case 404:
    case 410:
      return "no_invitation";
    case 429:
      return "limited";
    case 503:
      return "unavailable";
    default:
      return "failed";
  }
}
