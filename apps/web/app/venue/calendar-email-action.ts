"use server";

import { cookies } from "next/headers";
import { sendCalendarEmail, type CalendarEmailOutcome } from "../../lib/api/mail";
import { getLocale } from "../../lib/i18n/server";
import { INVITATION_COOKIE } from "../../lib/invite/cookie";

/**
 * Server Action (BFF) for the venue page's calendar invite (ADR-012). The bearer
 * token is read from the httpOnly cookie here and never reaches client JS; the
 * address goes straight to the API and is not stored or logged on the way.
 */
export async function sendCalendarInvite(email: string): Promise<CalendarEmailOutcome> {
  const [cookieStore, locale] = await Promise.all([cookies(), getLocale()]);
  const token = cookieStore.get(INVITATION_COOKIE)?.value;
  if (!token) return "no_invitation";
  if (typeof email !== "string" || email.trim().length === 0 || email.length > 254) return "invalid";
  return sendCalendarEmail(token, email.trim(), locale);
}
