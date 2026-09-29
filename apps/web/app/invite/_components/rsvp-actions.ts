"use server";

import { revalidateTag } from "next/cache";
import { cookies } from "next/headers";
import { hashToken } from "../../../lib/api/client";
import { putRsvp } from "../../../lib/api/rsvp";
import { INVITATION_COOKIE } from "../../../lib/invite/cookie";
import { mapRsvpResult, NO_TOKEN_STATE, parseRsvpForm, type RsvpFormState } from "../../../lib/invite/rsvp-form";

/**
 * Server Action (BFF): the bearer token is read from the httpOnly cookie here
 * and never reaches client JS. `maxPlusOnes` is only a UX pre-check; the API
 * enforces the real limit.
 */
export async function submitRsvp(maxPlusOnes: number, formData: FormData): Promise<RsvpFormState> {
  const token = (await cookies()).get(INVITATION_COOKIE)?.value;
  if (!token) return NO_TOKEN_STATE;

  const parsed = parseRsvpForm(formData, maxPlusOnes);
  if (!parsed.ok) return parsed.state;

  const result = await putRsvp(token, parsed.request);
  if (result.status === "ok") {
    // Same tag getInvitation uses, so the page re-fetches the new answer.
    revalidateTag(`invitation:${await hashToken(token)}`);
  }
  return mapRsvpResult(result);
}
