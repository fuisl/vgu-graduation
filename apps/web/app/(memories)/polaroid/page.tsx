import type {Metadata} from "next";
import {BrandEyebrow, BrandTheme, Cta, Section} from "@grad/ui";
import {pickMessages} from "../../../lib/i18n/dictionary";
import {getI18n} from "../../../lib/i18n/server";
import {SiteFooter} from "../../site/SiteFooter";
import {SiteHeader} from "../../site/SiteHeader";
import {CameraPanel} from "./CameraPanel";

export async function generateMetadata(): Promise<Metadata> {
  const {t} = await getI18n();
  return {title: t("polaroid.metaTitle")};
}

/** Not a nav item (the brief keeps four); reached from Gallery and Wishes. */
export default async function PolaroidPage() {
  const i18n = await getI18n();
  const {t} = i18n;
  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      <main id="main">
        <Section tone="blue" aria-labelledby="polaroid-title">
          <div className="mem-hero">
            <BrandEyebrow ellipsis>{t("polaroid.eyebrow")}</BrandEyebrow>
            <h1 id="polaroid-title" className="mem-title">{t("polaroid.title")}</h1>
            <Cta tone="on-blue" variant="secondary" href="/gallery">{t("polaroid.back")}</Cta>
          </div>
        </Section>
        <Section tone="white" density="compact" narrow>
          <CameraPanel messages={pickMessages(i18n.locale, "camera.")} />
        </Section>
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
