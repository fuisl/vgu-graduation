import { BrandEyebrow, BrandTheme, Cta, Section } from "@grad/ui";
import { getI18n } from "../../../lib/i18n/server";
import { SiteFooter } from "../../site/SiteFooter";
import { SiteHeader } from "../../site/SiteHeader";
import "../invite.css";

export default async function Demo() {
  const i18n = await getI18n();
  const { t } = i18n;
  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      <main className="invite-main">
        <Section tone="blue" aria-labelledby="demo-heading">
          <BrandEyebrow>{t("invite.demo.eyebrow")}</BrandEyebrow>
          <h1 id="demo-heading" className="invite-title invite-title--display">
            {t("invite.demo.title1")}
            <br />
            {t("invite.demo.title2")}
          </h1>
        </Section>
        <Section tone="white" density="compact" narrow>
          <div className="invite-body">
            <p>{t("invite.demo.body")}</p>
          </div>
          <div className="invite-actions">
            <Cta tone="on-white" href="/">{t("invite.demo.home")}</Cta>
          </div>
        </Section>
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
