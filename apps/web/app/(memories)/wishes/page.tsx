import type {Metadata} from "next";
import {BrandTheme} from "@grad/ui";
import {pickMessages} from "../../../lib/i18n/dictionary";
import {getI18n} from "../../../lib/i18n/server";
import {SiteFooter} from "../../site/SiteFooter";
import {SiteHeader} from "../../site/SiteHeader";
import {WishesView} from "./WishesView";

export async function generateMetadata(): Promise<Metadata> {
  const {t} = await getI18n();
  return {title: t("wishesPage.metaTitle")};
}

/** Composer first, everyone's wishes below. No hero and no explanatory copy (camera-first redesign). */
export default async function WishesPage() {
  const i18n = await getI18n();
  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} current="wishes" />
      <main id="main">
        <WishesView messages={pickMessages(i18n.locale, "wishes.", "gallery.", "print.")} intl={i18n.intl} />
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
