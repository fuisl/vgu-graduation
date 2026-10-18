import type { Metadata } from "next";
import { cookies } from "next/headers";
import { BrandTheme } from "@grad/ui";
import { getEvent } from "../../lib/api/event";
import { getInvitation } from "../../lib/api/invitations";
import { getRsvp } from "../../lib/api/rsvp";
import { savedNeedsFrom } from "../../lib/invite/accessibility";
import { INVITATION_COOKIE } from "../../lib/invite/cookie";
import { selectInvitePageState } from "../../lib/invite/state";
import { SiteFooter } from "../site/SiteFooter";
import { SiteHeader } from "../site/SiteHeader";
import { InviteNotice } from "./_components/InviteNotice";
import { PersonalInvitation } from "./_components/PersonalInvitation";
import "./invite.css";

// Personal page behind a bearer credential: keep it out of search and never leak the URL.
export const metadata: Metadata = {
  title: "Your invitation · GRAD '26",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function InvitePage() {
  const token = (await cookies()).get(INVITATION_COOKIE)?.value;

  // Independent calls: run together. No cookie means the API is never asked about an invitation.
  // GET /rsvp (no-store) only prefills the accessibility section; if it fails the form still works.
  const [invitation, event, saved] = await Promise.all([
    token ? getInvitation(token) : null,
    getEvent(),
    token ? getRsvp(token) : null,
  ]);
  const state = selectInvitePageState(invitation);

  return (
    <BrandTheme>
      <SiteHeader />
      <main className="invite-main">
        {state.kind === "personal" ? (
          <PersonalInvitation invitation={state.invitation} event={event} savedNeeds={savedNeedsFrom(saved)} />
        ) : (
          <InviteNotice kind={state.kind} event={event} />
        )}
      </main>
      <SiteFooter />
    </BrandTheme>
  );
}
