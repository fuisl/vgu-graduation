import type { Metadata } from "next";
import { BrandEyebrow, BrandTheme, Cta, Section } from "@grad/ui";
import { getI18n } from "../../../lib/i18n/server";
import { SiteFooter } from "../../site/SiteFooter";
import { SiteHeader } from "../../site/SiteHeader";
import "../invite.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("invite.demo.metaTitle") };
}

/** A preview of the invitation for anyone without one; it points guests to how to open theirs (QA P2-4). */
export default async function Demo() {
  const i18n = await getI18n();
  const { t } = i18n;
  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      <main id="main" className="invite-main">
        <Section tone="blue" aria-labelledby="demo-heading">
          <BrandEyebrow>{t("invite.demo.eyebrow")}</BrandEyebrow>
          {/* The space keeps the two lines apart for screen readers and copy-paste ("You are invited."). */}
          <h1 id="demo-heading" className="invite-title invite-title--display">
            {t("invite.demo.title1")}{" "}
            <br />
            {t("invite.demo.title2")}
          </h1>
        </Section>
        <Section tone="white" density="compact" narrow>
          <div className="invite-body">
            <p>{t("invite.demo.body")}</p>
          </div>
          <div className="invite-actions invite-actions--row">
            <Cta tone="on-white" href="/me">{t("invite.demo.howTo")}</Cta>
            <Cta tone="on-white" variant="secondary" href="/">{t("invite.demo.home")}</Cta>
          </div>
        </Section>
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
