import type { GuestGuideResponse, Invitation } from "@grad/contract";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { BrandEyebrow, BrandTheme, Cta, Section } from "@grad/ui";
import { getEvent } from "../../lib/api/event";
import { getGuide } from "../../lib/api/guide";
import { getInvitation } from "../../lib/api/invitations";
import type { ApiResult } from "../../lib/api/result";
import { guideByline } from "../../lib/guide/format";
import { INVITATION_COOKIE } from "../../lib/invite/cookie";
import { selectGuestPageState } from "../../lib/profile/state";
import { GuestNotice } from "../me/_components/GuestNotice";
import { SiteFooter } from "../site/SiteFooter";
import { SiteHeader } from "../site/SiteHeader";
import { GuideBook } from "./GuideBook";
import "../me/profile.css";
import "./guide.css";

// The guide is per invitation (tailored picks), so it is personal like /me.
export const metadata: Metadata = {
  title: "Guide-book · GRAD '26",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Guest guide-book (#140): linked from the profile and the invitation, not the top nav. */
export default async function GuidePage() {
  const token = (await cookies()).get(INVITATION_COOKIE)?.value;
  // Independent calls: run together. The event is only needed for the signed-out contact line.
  const [invitation, guide, event] = await Promise.all([
    token ? getInvitation(token) : null,
    token ? getGuide(token) : null,
    getEvent(),
  ]);
  const state = selectGuestPageState(Boolean(token), invitation);

  return (
    <BrandTheme>
      <SiteHeader />
      <main className="profile-main">
        {state.kind === "personal" ? (
          // A personal state implies a cookie, so guide is never null here.
          <PersonalGuide invitation={state.invitation} guide={guide ?? { status: "empty" }} />
        ) : (
          <GuestNotice kind={state.kind} event={event} retryHref="/guide" eyebrow="Guide-book" />
        )}
      </main>
      <SiteFooter />
    </BrandTheme>
  );
}

function PersonalGuide({ invitation, guide }: { invitation: Invitation; guide: ApiResult<GuestGuideResponse> }) {
  const tailored = guide.status === "ok" && guide.data.tailored;
  const inviters = invitation.inviters.map((inviter) => inviter.name);
  return (
    <>
      <Section tone="blue" aria-labelledby="guide-heading">
        <div className="guide-hero">
          <BrandEyebrow>Guide-book</BrandEyebrow>
          <h1 id="guide-heading" className="profile-name">While you are on campus</h1>
          <p className="profile-lead">{guideByline(tailored, inviters)}</p>
        </div>
      </Section>
      <Section tone="white" density="compact" aria-labelledby="guide-list-heading">
        <h2 id="guide-list-heading" className="brand-sr-only">Places and things to do</h2>
        {guide.status === "ok" && guide.data.items.length > 0 ? (
          <GuideBook items={guide.data.items} />
        ) : guide.status === "ok" ? (
          <div className="profile-block">
            <p role="status">No suggestions yet. The graduates are still choosing places; check back closer to the day.</p>
          </div>
        ) : (
          <div className="profile-block">
            <p role="status">The guide-book could not be loaded right now. This is a temporary problem, not your link.</p>
            <div>
              <Cta tone="on-white" variant="secondary" href="/guide">Try again</Cta>
            </div>
          </div>
        )}
        <p className="guide-back">
          <a className="profile-inline-link" href="/me">Back to your profile</a>
        </p>
      </Section>
    </>
  );
}
