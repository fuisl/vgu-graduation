import { invitationSchema, type Invitation } from "@grad/contract";
import { apiFetch, hashToken } from "./client";
import { type ApiResult, empty, errorResult, ok } from "./result";

/**
 * GET /invitations/me — revalidated every 60s, tagged per invitation so an
 * RSVP write can invalidate just that guest's cache entry (§4.1 table).
 */
export async function getInvitation(token: string): Promise<ApiResult<Invitation>> {
  let response: Response;
  try {
    response = await apiFetch("/invitations/me", {
      headers: { Authorization: `Bearer ${token}` },
      cache: { mode: "revalidate", seconds: 60, tags: [`invitation:${await hashToken(token)}`] },
    });
  } catch {
    return errorResult("network", "Could not reach the API");
  }

  if (response.status === 401 || response.status === 404) {
    return empty();
  }

  if (!response.ok) {
    return errorResult("http", "The API returned an unexpected error", response.status);
  }

  const parsed = invitationSchema.safeParse(await response.json());
  if (!parsed.success) {
    return errorResult("validation", "The API response did not match the expected shape");
  }

  return ok(parsed.data);
}
