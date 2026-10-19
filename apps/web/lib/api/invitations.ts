import { invitationSchema, type Invitation } from "@grad/contract";
import { apiFetch, hashToken } from "./client";
import { forgetGuide } from "./guide";
import { isCredentialRefusal, lastKnownGoodStore, mayUseLastKnownGood } from "./last-known-good";
import { type ApiResult, empty, errorResult, ok } from "./result";

/** Last good invitation per token hash, for API outages only (lib/api/last-known-good.ts). */
const lastKnownGood = lastKnownGoodStore<Invitation>("invitation");

/**
 * GET /invitations/me. Never cached (QA P0-1): the Next fetch cache would keep serving a
 * revoked, rotated or expired invitation. Results:
 *  - 200: `ok`, and remembered as the last known good copy while it is active;
 *  - 401, 403, 404: `empty` (missing, unknown, revoked or not-yet-valid token);
 *  - 410: an http error carrying 410 (expired);
 *  - network error or 5xx: the last known good copy if there is one (unless its `validUntil`
 *    has passed meanwhile), otherwise an error. A refusal is never answered from that copy.
 */
export async function getInvitation(token: string): Promise<ApiResult<Invitation>> {
  const key = await hashToken(token);
  let response: Response;
  try {
    response = await apiFetch("/invitations/me", {
      headers: { Authorization: `Bearer ${token}` },
      cache: { mode: "no-store" },
    });
  } catch {
    return fromLastKnownGood(key) ?? errorResult("network", "Could not reach the server");
  }

  if (isCredentialRefusal(response.status)) {
    forgetToken(key);
    return response.status === 410 ? errorResult("http", "This invitation has expired", 410) : empty();
  }

  if (!response.ok) {
    const fallback = mayUseLastKnownGood(response.status) ? fromLastKnownGood(key) : undefined;
    return fallback ?? errorResult("http", "The server returned an unexpected error", response.status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return errorResult("validation", "The server response was not valid JSON");
  }
  const parsed = invitationSchema.safeParse(body);
  if (!parsed.success) {
    return errorResult("validation", "The server response did not match the expected shape");
  }

  if (parsed.data.status === "active") lastKnownGood.set(key, parsed.data);
  else forgetToken(key);
  return ok(parsed.data);
}

/**
 * Drops every remembered copy of one invitation (and its guide), so an admin revoke or rotate
 * takes effect in this process even while the API is unreachable afterwards.
 */
export function forgetInvitation(invitationId: string): void {
  for (const key of lastKnownGood.deleteWhere((invitation) => invitation.id === invitationId)) forgetGuide(key);
}

function forgetToken(key: string): void {
  lastKnownGood.delete(key);
  forgetGuide(key);
}

function fromLastKnownGood(key: string, now = Date.now()): ApiResult<Invitation> | undefined {
  const invitation = lastKnownGood.get(key, now);
  if (!invitation) return undefined;
  if (invitation.validUntil !== null && Date.parse(invitation.validUntil) <= now) {
    forgetToken(key);
    return errorResult("http", "This invitation has expired", 410);
  }
  return ok(invitation);
}
