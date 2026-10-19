import type { Metadata } from "next";
import { BrandEyebrow, BrandTheme } from "@grad/ui";
import { getI18n } from "../../../lib/i18n/server";
import { demoBadgeCard, demoBadgeLabels } from "../../../lib/profile/badge";
import { SiteFooter } from "../../site/SiteFooter";
import { SiteHeader } from "../../site/SiteHeader";
import { BadgeStage } from "../badge/BadgeStage";
import { NameBadge } from "../badge/NameBadge";
import "../badge/badge.css";
import "./prototype.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("badge.metaTitle"), description: t("badge.metaDescription") };
}

/** The name badge with demo data (#152): the same component the guest portal (/me) prints the guest's name on. */
export default async function GuestPrototype() {
  const i18n = await getI18n();
  const { t } = i18n;
  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      <main id="main" className="guest-prototype">
        <BadgeStage
          className="badge-stage--full"
          labelledBy="guest-stage-title"
          badge={<NameBadge card={demoBadgeCard(i18n)} labels={demoBadgeLabels(i18n)} />}
        >
          {/* The page's one heading (QA P2-17); the badge itself is the visual title. */}
          <h1 id="guest-stage-title" className="brand-sr-only">{t("badge.stage")}</h1>
          <div className="guest-stage-footer">
            <BrandEyebrow>{t("badge.previewOnly")} <span aria-hidden="true">—</span> {t("badge.story")}</BrandEyebrow>
          </div>
        </BadgeStage>
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
