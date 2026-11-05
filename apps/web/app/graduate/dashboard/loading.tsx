import { BrandEyebrow, BrandTheme, Section } from "@grad/ui";
import { getI18n } from "../../../lib/i18n/server";
import { SiteFooter } from "../../site/SiteFooter";
import { SiteHeader } from "../../site/SiteHeader";
import "../../join/join.css";

export default async function Loading() {
  const i18n = await getI18n();
  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      <main id="main" className="join-main">
        <Section tone="blue" density="compact">
          <BrandEyebrow>{i18n.t("graduatePortal.eyebrow")}</BrandEyebrow>
          <p className="join-title" role="status">{i18n.t("graduatePortal.loading")}</p>
        </Section>
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
