import { BrandEyebrow, BrandTheme, Section } from "@grad/ui";
import { getI18n } from "../../lib/i18n/server";
import { SiteFooter } from "../site/SiteFooter";
import { SiteHeader } from "../site/SiteHeader";
import "../me/profile.css";
import "./guide.css";

export default async function Loading() {
  const i18n = await getI18n();
  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      <main id="main" className="profile-main">
        <Section tone="blue">
          <div className="guide-hero">
            <BrandEyebrow>{i18n.t("guide.eyebrow")}</BrandEyebrow>
            <p className="profile-name" role="status">{i18n.t("guide.loading")}</p>
          </div>
        </Section>
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
