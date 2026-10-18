import type { Invitation } from "@grad/contract";
import type { ApiResult } from "../api/result";
import { selectInvitePageState, type InvitePageState } from "../invite/state";

/**
 * Which version of a guest page (/me, /guide) to show. Like the invitation page,
 * plus `signed-out` when this device has no invitation cookie at all: the guest
 * has not opened their link here yet, which deserves an explainer, not an error.
 */
export type GuestPageState = InvitePageState | { kind: "signed-out" };

export function selectGuestPageState(hasToken: boolean, invitation: ApiResult<Invitation> | null): GuestPageState {
  if (!hasToken) return { kind: "signed-out" };
  return selectInvitePageState(invitation);
}

/** Where a guest goes from their profile. Public pages work signed out too (`public`). */
export const GUEST_LINKS: ReadonlyArray<{ href: string; title: string; description: string; public: boolean }> = [
  { href: "/invite", title: "Your invitation", description: "Your RSVP, the ceremony details and your pass.", public: false },
  { href: "/venue", title: "Venue and calendar", description: "When and where, directions and a calendar entry.", public: true },
  { href: "/guide", title: "Guide-book", description: "Places to see on campus while the graduates are busy.", public: false },
  {
    href: "/live",
    title: "Live captions",
    description: "Read the ceremony on your phone in Deutsch, English or Tiếng Việt (experimental).",
    public: true,
  },
  { href: "/gallery", title: "Gallery", description: "Photos from the day, from every guest's camera.", public: true },
  { href: "/wishes", title: "Wishes", description: "Leave a message for the graduates.", public: true },
  { href: "/polaroid", title: "Disposable camera", description: "Take photos for the shared roll.", public: false },
  { href: "/accessibility", title: "Accessibility", description: "Step-free access, captions and how to ask for help.", public: true },
];
