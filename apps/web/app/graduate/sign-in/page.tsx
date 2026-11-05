import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BrandEyebrow, BrandTheme, Cta, Section } from "@grad/ui";
import { getGraduateMe } from "../../../lib/api/graduate";
import { GRADUATE_SESSION_COOKIE, GRADUATE_SIGN_IN_COOKIE } from "../../../lib/graduate/cookie";
import { pickMessages } from "../../../lib/i18n/dictionary";
import { getI18n } from "../../../lib/i18n/server";
import { SiteFooter } from "../../site/SiteFooter";
import { SiteHeader } from "../../site/SiteHeader";
import { SignInConfirm } from "../_components/SignInConfirm";
import "../../join/join.css";
import "../graduate.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("graduatePortal.signIn.metaTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export const dynamic = "force-dynamic";

/**
 * /graduate/sign-in: one button between the emailed link and the dashboard (ADR-017). Opening the
 * link is a GET a mail scanner may also make, so nothing is spent until a person presses this.
 */
export default async function GraduateSignInPage() {
  const [store, i18n] = await Promise.all([cookies(), getI18n()]);
  const { t, locale } = i18n;
  const pending = Boolean(store.get(GRADUATE_SIGN_IN_COOKIE)?.value);
  if (!pending) {
    const session = store.get(GRADUATE_SESSION_COOKIE)?.value;
    if (session && (await getGraduateMe(session)).status === "ok") redirect("/graduate/dashboard");
  }

  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      <main id="main" className="join-main">
        <Section tone="blue" aria-labelledby="graduate-sign-in-heading">
          <BrandEyebrow>{t("graduatePortal.eyebrow")}</BrandEyebrow>
          {pending ? (
            <>
              <h1 id="graduate-sign-in-heading" className="join-title">{t("graduatePortal.signIn.title")}</h1>
              <p className="join-lead">{t("graduatePortal.signIn.lead")}</p>
              <SignInConfirm messages={pickMessages(locale, "graduatePortal.signIn.")} />
            </>
          ) : (
            <>
              <h1 id="graduate-sign-in-heading" className="join-title">{t("graduatePortal.signIn.invalidTitle")}</h1>
              <p className="join-lead">{t("graduatePortal.signIn.invalidBody")}</p>
              <div className="portal-actions">
                <Cta tone="on-blue" href="/graduate">{t("graduatePortal.signIn.requestAgain")}</Cta>
              </div>
            </>
          )}
        </Section>
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
