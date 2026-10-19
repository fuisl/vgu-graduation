import type { Metadata } from "next";
import { BrandEyebrow, BrandTheme } from "@grad/ui";
import { getI18n } from "../../../lib/i18n/server";
import { SiteFooter } from "../../site/SiteFooter";
import { SiteHeader } from "../../site/SiteHeader";
import { BadgeScene } from "./BadgeScene";
import "./prototype.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("badge.metaTitle"), description: t("badge.metaDescription") };
}

export default async function GuestPrototype() {
  const i18n = await getI18n();
  const { t } = i18n;
  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      <main className="guest-prototype">
        {/* Plain brand-blue stage; the canvas spans it so drags can reach the edges. */}
        <section className="guest-stage" aria-label={t("badge.stage")}>
          <div className="guest-object-scene">
            <BadgeScene labels={{ interactive: t("badge.interactive"), static: t("badge.static") }}>
              <p className="guest-badge-placeholder mono">{t("badge.placeholder")}</p>
            </BadgeScene>
          </div>
          <div className="guest-stage-footer">
            <BrandEyebrow>{t("badge.previewOnly")} <span aria-hidden="true">—</span> {t("badge.story")}</BrandEyebrow>
          </div>
        </section>
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
