import { BrandEyebrow, BrandTheme, Section } from "@grad/ui";
import { getI18n } from "../../../lib/i18n/server";
import { SiteFooter } from "../../site/SiteFooter";
import { SiteHeader } from "../../site/SiteHeader";
import "./archive.css";

/** Shown while /memories or its timeline renders on a slow connection (their listings are usually served from cache). */
export default async function Loading() {
  const i18n = await getI18n();
  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      <main>
        <Section tone="blue">
          <div className="mem-hero">
            <BrandEyebrow ellipsis>{i18n.t("memories.archive")}</BrandEyebrow>
            <p className="mem-title" role="status">{i18n.t("memories.loading")}</p>
          </div>
        </Section>
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
