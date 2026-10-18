import type { Metadata } from "next";
import { cookies } from "next/headers";
import { BrandTheme } from "@grad/ui";
import { getEvent } from "../../lib/api/event";
import { getInvitation } from "../../lib/api/invitations";
import { INVITATION_COOKIE } from "../../lib/invite/cookie";
import { selectGuestPageState } from "../../lib/profile/state";
import { SiteFooter } from "../site/SiteFooter";
import { SiteHeader } from "../site/SiteHeader";
import { GuestNotice } from "./_components/GuestNotice";
import { GuestProfile } from "./_components/GuestProfile";
import "../invite/invite.css";
import "./profile.css";

// Personal page behind the invitation cookie: keep it out of search and never leak the URL.
export const metadata: Metadata = {
  title: "Your profile · GRAD '26",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Guest profile (#139). Signed out, expired or broken invitations get an explainer instead. */
export default async function ProfilePage() {
  const token = (await cookies()).get(INVITATION_COOKIE)?.value;
  const [invitation, event] = await Promise.all([token ? getInvitation(token) : null, getEvent()]);
  const state = selectGuestPageState(Boolean(token), invitation);

  return (
    <BrandTheme>
      <SiteHeader />
      <main className="profile-main">
        {state.kind === "personal" ? (
          <GuestProfile invitation={state.invitation} event={event} />
        ) : (
          <GuestNotice kind={state.kind} event={event} retryHref="/me" eyebrow="Guest portal" />
        )}
      </main>
      <SiteFooter />
    </BrandTheme>
  );
}
