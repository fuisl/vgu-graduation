import type { Invitation } from "@grad/contract";
import type { ApiResult } from "../api/result";
import { selectInvitePageState, type InvitePageState } from "../invite/state";

/**
 * Which version of a guest page (/me, /guide) to show. Like the invitation page,
 * plus `signed-out` when this device has no invitation cookie at all: the guest
 * has not opened their link here yet, which deserves an explainer, not an error.
 */
export type GuestPageState = Exclude<InvitePageState, { kind: "missing" }> | { kind: "signed-out" };

export function selectGuestPageState(hasToken: boolean, invitation: ApiResult<Invitation> | null): GuestPageState {
  if (!hasToken) return { kind: "signed-out" };
  const state = selectInvitePageState(invitation);
  // The invitation page calls a missing cookie "missing"; guest pages explain it as signed out.
  return state.kind === "missing" ? { kind: "signed-out" } : state;
}

export type GuestLinkId = "guide";

/**
 * The guest's own pages on their profile that the site menu does not already link (the menu has
 * the venue, gallery, wishes, camera, live captions and accessibility; the invitation is the
 * profile's action). The title is the `profile.link.<id>.title` message (#9).
 */
export const GUEST_LINKS: ReadonlyArray<{ id: GuestLinkId; href: string }> = [{ id: "guide", href: "/guide" }];
