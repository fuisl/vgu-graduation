import type { Metadata } from "next";
import { cookies } from "next/headers";
import { BrandTheme } from "@grad/ui";
import { getEvent } from "../../lib/api/event";
import { getInvitation } from "../../lib/api/invitations";
import { localizeEventResult } from "../../lib/i18n/event";
import { getI18n } from "../../lib/i18n/server";
import { INVITATION_COOKIE } from "../../lib/invite/cookie";
import { loadPassArt } from "../../lib/invite/pass-art";
import { demoBadgeCard, demoBadgeLabels } from "../../lib/profile/badge";
import { selectGuestPageState } from "../../lib/profile/state";
import { NameBadge } from "../guest/badge/NameBadge";
import { SiteFooter } from "../site/SiteFooter";
import { SiteHeader } from "../site/SiteHeader";
import { GuestNotice } from "./_components/GuestNotice";
import { GuestProfile } from "./_components/GuestProfile";
import "../invite/invite.css";
import "../guest/badge/badge.css";
import "./profile.css";

// Personal page behind the invitation cookie: keep it out of search and never leak the URL.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("profile.metaTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/** Guest portal (#139): the guest's name badge. Signed out, expired or broken invitations get an explainer instead. */
export default async function ProfilePage() {
  const token = (await cookies()).get(INVITATION_COOKIE)?.value;
  // The pass QR for the badge starts now and is never awaited here: the badge and the "Save badge"
  // row stream it in, so the portal paints without it. It resolves to null on any failure.
  const art = token ? loadPassArt(token) : null;
  const [invitation, eventResult, i18n] = await Promise.all([token ? getInvitation(token) : null, getEvent(), getI18n()]);
  const event = localizeEventResult(eventResult, i18n.locale);
  const state = selectGuestPageState(Boolean(token), invitation);

  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      <main id="main" className="profile-main">
        {state.kind === "personal" ? (
          <GuestProfile i18n={i18n} invitation={state.invitation} event={event} art={art} />
        ) : (
          <GuestNotice
            i18n={i18n}
            kind={state.kind}
            event={event}
            retryHref="/me"
            eyebrow={i18n.t("profile.eyebrow")}
            badge={state.kind === "signed-out" ? <NameBadge card={demoBadgeCard(i18n)} labels={demoBadgeLabels(i18n)} /> : undefined}
          />
        )}
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
