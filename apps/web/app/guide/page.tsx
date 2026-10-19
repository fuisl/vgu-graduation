import type { GuestGuideResponse, Invitation } from "@grad/contract";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { BrandEyebrow, BrandTheme, Cta, Section } from "@grad/ui";
import { getEvent } from "../../lib/api/event";
import { getGuide } from "../../lib/api/guide";
import { getInvitation } from "../../lib/api/invitations";
import type { ApiResult } from "../../lib/api/result";
import { guideByline } from "../../lib/guide/format";
import { pickMessages, type I18n } from "../../lib/i18n/dictionary";
import { localizeEventResult } from "../../lib/i18n/event";
import { getI18n } from "../../lib/i18n/server";
import { INVITATION_COOKIE } from "../../lib/invite/cookie";
import { selectGuestPageState } from "../../lib/profile/state";
import { GuestNotice } from "../me/_components/GuestNotice";
import { SiteFooter } from "../site/SiteFooter";
import { SiteHeader } from "../site/SiteHeader";
import { GuideBook } from "./GuideBook";
import "../me/profile.css";
import "./guide.css";

// The guide is per invitation (tailored picks), so it is personal like /me.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("guide.metaTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/** Guest guide-book (#140): linked from the profile and the invitation, not the top nav. */
export default async function GuidePage() {
  const token = (await cookies()).get(INVITATION_COOKIE)?.value;
  // Independent calls: run together. The event is only needed for the signed-out contact line.
  const [invitation, guide, eventResult, i18n] = await Promise.all([
    token ? getInvitation(token) : null,
    token ? getGuide(token) : null,
    getEvent(),
    getI18n(),
  ]);
  const event = localizeEventResult(eventResult, i18n.locale);
  const state = selectGuestPageState(Boolean(token), invitation);

  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      <main id="main" className="profile-main">
        {state.kind === "personal" ? (
          // A personal state implies a cookie, so guide is never null here.
          <PersonalGuide i18n={i18n} invitation={state.invitation} guide={guide ?? { status: "empty" }} />
        ) : (
          <GuestNotice i18n={i18n} kind={state.kind} event={event} retryHref="/guide" eyebrow={i18n.t("guide.eyebrow")} />
        )}
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}

function PersonalGuide({ invitation, guide, i18n }: { invitation: Invitation; guide: ApiResult<GuestGuideResponse>; i18n: I18n }) {
  const { t } = i18n;
  const tailored = guide.status === "ok" && guide.data.tailored;
  const inviters = invitation.inviters.map((inviter) => inviter.name);
  return (
    <>
      <Section tone="blue" aria-labelledby="guide-heading">
        <div className="guide-hero">
          <BrandEyebrow>{t("guide.eyebrow")}</BrandEyebrow>
          <h1 id="guide-heading" className="profile-name">{t("guide.title")}</h1>
          <p className="profile-lead">{guideByline(tailored, inviters, i18n)}</p>
        </div>
      </Section>
      <Section tone="white" density="compact" aria-labelledby="guide-list-heading">
        <h2 id="guide-list-heading" className="brand-sr-only">{t("guide.listHeading")}</h2>
        {guide.status === "ok" && guide.data.items.length > 0 ? (
          <GuideBook items={guide.data.items} messages={pickMessages(i18n.locale, "guide.book.", "guide.category.")} />
        ) : guide.status === "ok" ? (
          <div className="profile-block">
            <p role="status">{t("guide.empty")}</p>
          </div>
        ) : (
          <div className="profile-block">
            <p role="status">{t("guide.unavailable")}</p>
            <div>
              <Cta tone="on-white" variant="secondary" href="/guide">{t("common.tryAgain")}</Cta>
            </div>
          </div>
        )}
        <p className="guide-back">
          <a className="profile-inline-link" href="/me">{t("guide.back")}</a>
        </p>
      </Section>
    </>
  );
}
