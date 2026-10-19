"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { putRsvp } from "../../../lib/api/rsvp";
import { getI18n } from "../../../lib/i18n/server";
import { INVITATION_COOKIE } from "../../../lib/invite/cookie";
import { mapRsvpResult, noTokenState, parseRsvpForm, type RsvpFormState } from "../../../lib/invite/rsvp-form";

/**
 * Server Action (BFF): the bearer token is read from the httpOnly cookie here
 * and never reaches client JS. `maxPlusOnes` is only a UX pre-check; the API
 * enforces the real limit. Messages come back in the guest's language (#9).
 */
export async function submitRsvp(maxPlusOnes: number, formData: FormData): Promise<RsvpFormState> {
  const [cookieStore, i18n] = await Promise.all([cookies(), getI18n()]);
  const token = cookieStore.get(INVITATION_COOKIE)?.value;
  if (!token) return noTokenState(i18n);

  const parsed = parseRsvpForm(formData, maxPlusOnes, i18n);
  if (!parsed.ok) return parsed.state;

  const result = await putRsvp(token, parsed.request);
  if (result.status === "ok") {
    // GET /invitations/me is never cached (QA P0-1), so there is no tag to invalidate; this only
    // tells Next to send the re-rendered /invite back with the action, so "Your RSVP" shows the new answer.
    revalidatePath("/invite");
  }
  return mapRsvpResult(result, i18n);
}
