import type { Metadata } from "next";
import { BrandTheme } from "@grad/ui";
import { pickMessages } from "../../lib/i18n/dictionary";
import { getI18n } from "../../lib/i18n/server";
import { SiteHeader } from "../site/SiteHeader";
import { LiveCaptions } from "./LiveCaptions";
import "./live.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("live.metaTitle"), description: t("live.metaDescription") };
}

/**
 * /live (#70): live translation captions for phones. Experimental: everything
 * here is client-side and talks to the API directly (ADR-003), so a missing or
 * suspended translation service only changes this page's state. Not in the
 * header nav (four links); linked from the invitation and the event display.
 * No footer: the page is anchored to its live edge at the bottom.
 */
export default async function LivePage() {
  const i18n = await getI18n();
  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      <LiveCaptions messages={pickMessages(i18n.locale, "live.")} locale={i18n.locale} />
    </BrandTheme>
  );
}
