import type { Metadata } from "next";
import { cookies } from "next/headers";
import { INVITE_ANSWER_PARAM } from "@grad/contract";
import { BrandTheme } from "@grad/ui";
import { getEvent } from "../../lib/api/event";
import { getInvitation } from "../../lib/api/invitations";
import { getRsvp } from "../../lib/api/rsvp";
import { localizeEventResult } from "../../lib/i18n/event";
import { getI18n } from "../../lib/i18n/server";
import { savedNeedsFrom } from "../../lib/invite/accessibility";
import { parseInviteAnswer } from "../../lib/invite/answer";
import { INVITATION_COOKIE } from "../../lib/invite/cookie";
import { selectInvitePageState } from "../../lib/invite/state";
import { SiteFooter } from "../site/SiteFooter";
import { SiteHeader } from "../site/SiteHeader";
import { InviteNotice } from "./_components/InviteNotice";
import { PersonalInvitation } from "./_components/PersonalInvitation";
import "./invite.css";

// Personal page behind a bearer credential: keep it out of search and never leak the URL.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("invite.metaTitle"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function InvitePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const token = (await cookies()).get(INVITATION_COOKIE)?.value;
  // From an email's Yes / No link (ADR-016): only pre-selects the form. Saving takes the guest's submit.
  const linkAnswer = parseInviteAnswer((await searchParams)[INVITE_ANSWER_PARAM]);

  // Independent calls: run together. No cookie means the API is never asked about an invitation.
  // GET /rsvp (no-store) only prefills the accessibility section; if it fails the form still works.
  const [invitation, eventResult, saved, i18n] = await Promise.all([
    token ? getInvitation(token) : null,
    getEvent(),
    token ? getRsvp(token) : null,
    getI18n(),
  ]);
  const event = localizeEventResult(eventResult, i18n.locale);
  const state = selectInvitePageState(invitation);

  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      {/* A notice is one blue band; the page stays blue down to the footer. */}
      <main id="main" className={state.kind === "personal" ? "invite-main" : "invite-main invite-main--notice"}>
        {state.kind === "personal" ? (
          <PersonalInvitation i18n={i18n} invitation={state.invitation} event={event} savedNeeds={savedNeedsFrom(saved)} linkAnswer={linkAnswer} />
        ) : (
          <InviteNotice i18n={i18n} kind={state.kind} event={event} linkAnswer={linkAnswer} />
        )}
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
