import type {Metadata} from "next";
import {BrandTheme} from "@grad/ui";
import {pickMessages} from "../../../lib/i18n/dictionary";
import {getI18n} from "../../../lib/i18n/server";
import {SiteFooter} from "../../site/SiteFooter";
import {SiteHeader} from "../../site/SiteHeader";
import {Locket} from "./Locket";

export async function generateMetadata(): Promise<Metadata> {
  const {t} = await getI18n();
  return {title: t("gallery.metaTitle")};
}

/**
 * The Digital Locket: the camera opens on entry, everyone's photos are one scroll below.
 * No hero and no explanatory copy: event facts, language and text size live in the site header.
 * /polaroid redirects here.
 */
export default async function GalleryPage() {
  const i18n = await getI18n();
  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} current="gallery" />
      <main id="main" className="lk-camera-main">
        <Locket messages={pickMessages(i18n.locale, "camera.", "gallery.", "print.")} intl={i18n.intl} />
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
