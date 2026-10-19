import { guestGuideResponseSchema, type GuestGuideResponse } from "@grad/contract";
import { apiFetch, hashToken } from "./client";
import { isCredentialRefusal, lastKnownGoodStore, mayUseLastKnownGood } from "./last-known-good";
import { type ApiResult, empty, errorResult, ok } from "./result";

/** Last good guide per token hash, for API outages only (lib/api/last-known-good.ts). */
const lastKnownGood = lastKnownGoodStore<GuestGuideResponse>("guide");

/** Drops the remembered guide for one token hash (getInvitation calls this on a refusal or revoke). */
export function forgetGuide(tokenHash: string): void {
  lastKnownGood.delete(tokenHash);
}

/**
 * GET /invitations/me/guide (#140): the guest's guide-book. Never cached (QA P0-1), like
 * getInvitation: 401/403/404 are `empty`, 410 is an http error carrying the status (expired), and
 * on a network error or 5xx the last good copy is served, which is what a phone on venue Wi-Fi
 * needs. A refusal deletes that copy and is never answered from it.
 */
export async function getGuide(token: string): Promise<ApiResult<GuestGuideResponse>> {
  const key = await hashToken(token);
  let response: Response;
  try {
    response = await apiFetch("/invitations/me/guide", {
      headers: { Authorization: `Bearer ${token}` },
      cache: { mode: "no-store" },
    });
  } catch {
    return fromLastKnownGood(key) ?? errorResult("network", "Could not reach the server");
  }

  if (isCredentialRefusal(response.status)) {
    forgetGuide(key);
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
  const parsed = guestGuideResponseSchema.safeParse(body);
  if (!parsed.success) return errorResult("validation", "The server response did not match the expected shape");
  lastKnownGood.set(key, parsed.data);
  return ok(parsed.data);
}

function fromLastKnownGood(key: string): ApiResult<GuestGuideResponse> | undefined {
  const guide = lastKnownGood.get(key);
  return guide ? ok(guide) : undefined;
}
