import { BrandEyebrow, BrandTheme } from "@grad/ui";
import { getI18n } from "../../lib/i18n/server";
import { BadgePlaceholder } from "../guest/badge/BadgeFallback";
import { BadgeStage } from "../guest/badge/BadgeStage";
import { SiteFooter } from "../site/SiteFooter";
import { SiteHeader } from "../site/SiteHeader";
import "../guest/badge/badge.css";
import "./profile.css";

export default async function Loading() {
  const i18n = await getI18n();
  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      <main id="main" className="profile-main">
        <BadgeStage labelledBy="profile-loading" badge={<BadgePlaceholder />}>
          <BrandEyebrow>{i18n.t("profile.eyebrow")}</BrandEyebrow>
          <p id="profile-loading" className="profile-status" role="status">{i18n.t("profile.loading")}</p>
        </BadgeStage>
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
