import { BrandEyebrow, BrandTheme, Section } from "@grad/ui";
import { getI18n } from "../../lib/i18n/server";
import { SiteFooter } from "../site/SiteFooter";
import { SiteHeader } from "../site/SiteHeader";
import "./profile.css";

export default async function Loading() {
  const i18n = await getI18n();
  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      <main className="profile-main">
        <Section tone="blue">
          <div className="profile-hero">
            <span className="profile-hero__placeholder" aria-hidden="true" />
            <div className="profile-hero__text">
              <BrandEyebrow>{i18n.t("header.guestPortal")}</BrandEyebrow>
              <p className="profile-name" role="status">{i18n.t("profile.loading")}</p>
            </div>
          </div>
        </Section>
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
