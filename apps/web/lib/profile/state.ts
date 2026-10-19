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

export type GuestLinkId = "invite" | "venue" | "guide" | "live" | "gallery" | "wishes" | "polaroid" | "accessibility";

/**
 * Where a guest goes from their profile. Public pages work signed out too (`public`).
 * Title and description are the `profile.link.<id>.title` / `.description` messages (#9).
 */
export const GUEST_LINKS: ReadonlyArray<{ id: GuestLinkId; href: string; public: boolean }> = [
  { id: "invite", href: "/invite", public: false },
  { id: "venue", href: "/venue", public: true },
  { id: "guide", href: "/guide", public: false },
  { id: "live", href: "/live", public: true },
  { id: "gallery", href: "/gallery", public: true },
  { id: "wishes", href: "/wishes", public: true },
  { id: "polaroid", href: "/polaroid", public: false },
  { id: "accessibility", href: "/accessibility", public: true },
];
