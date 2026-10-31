import type { Metadata } from "next";
import { BrandEyebrow, BrandTheme, Section } from "@grad/ui";
import { isMailEnabled } from "../../lib/api/mail";
import { pickMessages } from "../../lib/i18n/dictionary";
import { getI18n } from "../../lib/i18n/server";
import { JoinLinkForm } from "../join/_components/JoinLinkForm";
import { SiteFooter } from "../site/SiteFooter";
import { SiteHeader } from "../site/SiteHeader";
import "../join/join.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("graduate.metaTitle"), description: t("graduate.metaDescription") };
}

export const dynamic = "force-dynamic";

/**
 * /graduate: a graduate gets their guest link by email (ADR-015). How it works in three steps on
 * blue, the one-field form on white. While mail is off the form is replaced by the organizers' note.
 */
export default async function GraduatePage() {
  const [mailEnabled, i18n] = await Promise.all([isMailEnabled(), getI18n()]);
  const { t, locale } = i18n;

  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      <main id="main" className="join-main">
        <Section tone="blue" aria-labelledby="graduate-heading">
          <BrandEyebrow>{t("graduate.eyebrow")}</BrandEyebrow>
          <h1 id="graduate-heading" className="join-title">{t("graduate.title")}</h1>
          <p className="join-lead">{t("graduate.lead")}</p>
          <ol className="join-steps">
            <li>{t("graduate.step1")}</li>
            <li>{t("graduate.step2")}</li>
            <li>{t("graduate.step3")}</li>
          </ol>
        </Section>
        <Section tone="white" density="compact" narrow>
          {mailEnabled ? (
            <JoinLinkForm messages={pickMessages(locale, "graduate.form.")} />
          ) : (
            <p className="join-text" role="status">{t("graduate.unavailable")}</p>
          )}
        </Section>
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
