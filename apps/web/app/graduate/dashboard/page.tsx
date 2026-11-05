import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BrandEyebrow, BrandTheme, Cta, Section } from "@grad/ui";
import { getGraduateGuests, getGraduateMe } from "../../../lib/api/graduate";
import { isMailEnabled } from "../../../lib/api/mail";
import { GRADUATE_SESSION_COOKIE } from "../../../lib/graduate/cookie";
import { pickMessages } from "../../../lib/i18n/dictionary";
import { getI18n } from "../../../lib/i18n/server";
import { SiteFooter } from "../../site/SiteFooter";
import { SiteHeader } from "../../site/SiteHeader";
import { signOutGraduate } from "../actions";
import { GuestLinkPanel } from "../_components/GuestLinkPanel";
import { GuestSummary, GuestsProvider } from "../_components/GuestsProvider";
import { GuestsPanel } from "../_components/GuestsPanel";
import { InviteForm } from "../_components/InviteForm";
import "../../join/join.css";
import "../graduate.css";

// Personal, and it shows the join link: out of search, out of Referer headers, never cached.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("graduatePortal.metaTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export const dynamic = "force-dynamic";

/**
 * /graduate/dashboard (ADR-017): who a graduate's guests are. A blue greeting with the counts, then
 * compact white working bands: the guest link, the list, the invite form. Each read fails on its
 * own, so an API error degrades that section, not the page. No session goes back to /graduate.
 */
export default async function GraduateDashboardPage() {
  const [store, i18n] = await Promise.all([cookies(), getI18n()]);
  const session = store.get(GRADUATE_SESSION_COOKIE)?.value;
  if (!session) redirect("/graduate");

  const [me, guests, mailEnabled] = await Promise.all([getGraduateMe(session), getGraduateGuests(session), isMailEnabled()]);
  if (me.status === "unauthorized" || guests.status === "unauthorized") redirect("/graduate");

  const { t, locale, intl } = i18n;

  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      <main id="main" className="join-main portal-main">
        <GuestsProvider initial={guests.status === "ok" ? guests.data.items : null}>
        <Section tone="blue" density="compact" aria-labelledby="portal-heading">
          <BrandEyebrow>{t("graduatePortal.eyebrow")}</BrandEyebrow>
          <h1 id="portal-heading" className="join-title">
            {me.status === "ok" ? t("graduatePortal.greeting", { name: me.data.graduate.givenName }) : t("graduatePortal.greetingGeneric")}
          </h1>
          <p className="join-lead">{t("graduatePortal.lead")}</p>
          <GuestSummary messages={pickMessages(locale, "graduatePortal.summary.")} />
          <form action={signOutGraduate} className="portal-actions">
            <Cta tone="on-blue" variant="secondary" type="submit">{t("graduatePortal.signOut")}</Cta>
          </form>
        </Section>

        <Section tone="white" density="compact" aria-labelledby="portal-link-heading">
          <BrandEyebrow>{t("graduatePortal.link.eyebrow")}</BrandEyebrow>
          <h2 id="portal-link-heading" className="portal-heading">{t("graduatePortal.link.title")}</h2>
          {me.status === "ok" ? (
            <GuestLinkPanel joinUrl={me.data.joinUrl} messages={pickMessages(locale, "graduatePortal.link.")} />
          ) : (
            <SectionError message={t("graduatePortal.link.error")} retry={t("common.tryAgain")} />
          )}
        </Section>

        <Section tone="white" density="compact" id="guests" aria-labelledby="portal-guests-heading">
          <BrandEyebrow>{t("graduatePortal.guests.eyebrow")}</BrandEyebrow>
          <h2 id="portal-guests-heading" className="portal-heading">{t("graduatePortal.guests.title")}</h2>
          <GuestsPanel
            intl={intl}
            messages={pickMessages(locale, "graduatePortal.guests.")}
            fallback={<SectionError message={t("graduatePortal.guests.error")} retry={t("common.tryAgain")} />}
          />
        </Section>

        <Section tone="white" density="compact" id="invite" aria-labelledby="portal-invite-heading">
          <BrandEyebrow>{t("graduatePortal.invite.eyebrow")}</BrandEyebrow>
          <h2 id="portal-invite-heading" className="portal-heading">{t("graduatePortal.invite.title")}</h2>
          {mailEnabled ? (
            <InviteForm messages={pickMessages(locale, "graduatePortal.invite.")} />
          ) : (
            <p className="join-text" role="status">{t("graduatePortal.invite.unavailable")}</p>
          )}
        </Section>
        </GuestsProvider>
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}

function SectionError({ message, retry }: { message: string; retry: string }) {
  return (
    <div className="portal-actions" role="status">
      <p className="join-text">{message}</p>
      <Cta tone="on-white" variant="secondary" href="/graduate/dashboard">{retry}</Cta>
    </div>
  );
}
