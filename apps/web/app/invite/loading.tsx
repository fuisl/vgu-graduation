import { BrandEyebrow, BrandTheme, Section } from "@grad/ui";
import { getI18n } from "../../lib/i18n/server";
import { SiteFooter } from "../site/SiteFooter";
import { SiteHeader } from "../site/SiteHeader";
import "./invite.css";

export default async function Loading() {
  const i18n = await getI18n();
  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      <main className="invite-main">
        <Section tone="blue">
          <BrandEyebrow>{i18n.t("invite.eyebrow")}</BrandEyebrow>
          <p className="invite-title" role="status">{i18n.t("invite.loading")}</p>
        </Section>
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
