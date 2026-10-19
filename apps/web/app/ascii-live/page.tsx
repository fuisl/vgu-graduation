import type { Metadata } from "next";
import { BrandTheme } from "@grad/ui";
import { pickMessages } from "../../lib/i18n/dictionary";
import { getI18n } from "../../lib/i18n/server";
import { SiteFooter } from "../site/SiteFooter";
import { SiteHeader } from "../site/SiteHeader";
import { AsciiLive } from "./AsciiLive";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("ascii.metaTitle"), description: t("ascii.metaDescription") };
}

export default async function AsciiLivePage() {
  const i18n = await getI18n();
  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      <AsciiLive messages={pickMessages(i18n.locale, "ascii.")} />
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
