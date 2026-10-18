import { guestGuideResponseSchema, type GuestGuideResponse } from "@grad/contract";
import { apiFetch, hashToken } from "./client";
import { type ApiResult, empty, errorResult, ok } from "./result";

/** Cache tag for one invitation's guide; derived from the token hash, never the token. */
export async function guideCacheTag(token: string): Promise<string> {
  return `guide:${await hashToken(token)}`;
}

/**
 * GET /invitations/me/guide (#140): the guest's guide-book. Revalidated every
 * 300s like the API's `private, max-age=300`, tagged per invitation. A stale
 * copy keeps being served while the API is unreachable, which is what a phone on
 * venue Wi-Fi needs. Errors mirror getInvitation: 401/404 are `empty`, 410 is an
 * http error carrying the status (expired).
 */
export async function getGuide(token: string): Promise<ApiResult<GuestGuideResponse>> {
  let response: Response;
  try {
    response = await apiFetch("/invitations/me/guide", {
      headers: { Authorization: `Bearer ${token}` },
      cache: { mode: "revalidate", seconds: 300, tags: [await guideCacheTag(token)] },
    });
  } catch {
    return errorResult("network", "Could not reach the API");
  }

  if (response.status === 401 || response.status === 404) return empty();
  if (!response.ok) return errorResult("http", "The API returned an unexpected error", response.status);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return errorResult("validation", "The API response was not valid JSON");
  }
  const parsed = guestGuideResponseSchema.safeParse(body);
  if (!parsed.success) return errorResult("validation", "The API response did not match the expected shape");
  return ok(parsed.data);
}
