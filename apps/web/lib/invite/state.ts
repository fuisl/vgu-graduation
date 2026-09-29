import type { Invitation } from "@grad/contract";
import type { ApiResult } from "../api/result";

/**
 * Which version of the invitation page to show. Pure so it can be tested
 * without rendering; the page maps each kind to a component.
 *  - personal: valid invitation, personalized content
 *  - invalid:  no cookie, unknown/revoked/not-yet-valid token (API 401/404)
 *  - expired:  API 410
 *  - error:    API unreachable or misbehaving; not the guest's fault
 */
export type InvitePageState =
  | { kind: "personal"; invitation: Invitation }
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "error" };

/** `invitation` is null when there was no cookie (the API is not called at all). */
export function selectInvitePageState(invitation: ApiResult<Invitation> | null): InvitePageState {
  if (invitation === null) return { kind: "invalid" };
  switch (invitation.status) {
    case "ok":
      // A revoked invitation should 404, but never show personal data for one.
      return invitation.data.status === "active"
        ? { kind: "personal", invitation: invitation.data }
        : { kind: "invalid" };
    case "empty":
      return { kind: "invalid" };
    case "error":
      return invitation.kind === "http" && invitation.httpStatus === 410 ? { kind: "expired" } : { kind: "error" };
  }
}
