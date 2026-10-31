"use server";

import { joinCodeSchema } from "@grad/contract";
import { registerGuest, requestJoinLink, type JoinLinkOutcome, type JoinOutcome } from "../../lib/api/join";
import { getLocale } from "../../lib/i18n/server";

/*
 * Server Actions (BFF) for guest self-registration (ADR-015). What people type goes
 * straight to the API and is neither stored nor logged on the way.
 */

const tooLong = (value: unknown, max: number) => typeof value !== "string" || value.trim().length === 0 || value.length > max;

/** A guest registers through a graduate's join link. */
export async function joinAsGuest(code: string, name: string, email: string, website: string): Promise<JoinOutcome> {
  if (!joinCodeSchema.safeParse(code).success) return "unknown";
  if (tooLong(name, 120) || tooLong(email, 254)) return "invalid";
  return registerGuest(code, { name: name.trim(), email: email.trim(), ...(website ? { website: String(website).slice(0, 200) } : {}) });
}

/** A graduate asks for their join link by email. */
export async function askForJoinLink(email: string): Promise<JoinLinkOutcome> {
  if (tooLong(email, 254)) return "invalid";
  return requestJoinLink(email.trim(), await getLocale());
}
