import type {Metadata} from "next";
import {BrandEyebrow, BrandTheme, Cta, Section} from "@grad/ui";
import {pickMessages} from "../../../lib/i18n/dictionary";
import {getI18n} from "../../../lib/i18n/server";
import {SiteFooter} from "../../site/SiteFooter";
import {SiteHeader} from "../../site/SiteHeader";
import {GalleryView} from "./GalleryView";

export async function generateMetadata(): Promise<Metadata> {
  const {t} = await getI18n();
  return {title: t("gallery.metaTitle")};
}

export default async function GalleryPage() {
  const i18n = await getI18n();
  const {t} = i18n;
  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} current="gallery" />
      <main id="main">
        <Section tone="blue" aria-labelledby="gallery-title">
          <div className="mem-hero">
            <BrandEyebrow ellipsis>{t("gallery.eyebrow")}</BrandEyebrow>
            <h1 id="gallery-title" className="mem-title">{t("gallery.title")}</h1>
            <div className="gal-hero-actions">
              <Cta tone="on-blue" variant="secondary" href="/polaroid">{t("gallery.takePhoto")}</Cta>
              <Cta tone="on-blue" variant="secondary" href="/memories">{t("landing.gallery.archive")}</Cta>
            </div>
          </div>
        </Section>
        <Section tone="white" density="compact">
          <GalleryView messages={pickMessages(i18n.locale, "gallery.", "print.")} intl={i18n.intl} />
        </Section>
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
