import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { BrandTheme } from "@grad/ui";
import { getEvent } from "../../lib/api/event";
import { pickMessages } from "../../lib/i18n/dictionary";
import { localizeEvent } from "../../lib/i18n/event";
import { getI18n } from "../../lib/i18n/server";
import { formatEventWhen } from "../../lib/invite/format";
import { displayLink, publicSiteOrigin, renderLinkQrSvg } from "../../lib/live/site-link";
import { BRAND_THEME_COLOR } from "../site/theme-color";
import { parseCaptionSetting } from "./caption-setting";
import { DisplayScreen } from "./DisplayScreen";
import "./display.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("display.metaTitle"), robots: { index: false, follow: false } };
}

export const viewport: Viewport = { themeColor: BRAND_THEME_COLOR };

// The QR links back to whichever host serves the page; GET /event caches itself.
export const dynamic = "force-dynamic";

/**
 * /display (#66): the projector page in the hall. No site header or footer.
 * Access: the page shell is public; the feed needs the invitation credential
 * (decided with #65, `apps/api/src/modules/live/live.routes.ts`), so the kiosk
 * gets its own invitation and opens its link once in the kiosk browser. A
 * phone guest who opens /display sees their own feed the same way.
 * `?captions=off|en|vi|de` picks the caption line (default: the other hall language).
 */
export default async function DisplayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [event, requestHeaders, params, i18n] = await Promise.all([getEvent(), headers(), searchParams, getI18n()]);
  const origin = publicSiteOrigin(process.env.PUBLIC_ORIGIN, requestHeaders.get("host"), requestHeaders.get("x-forwarded-proto"));
  const wishesUrl = `${origin}/wishes`;
  const wishesQrSvg = await renderLinkQrSvg(wishesUrl);
  const data = event.status === "ok" ? localizeEvent(event.data, i18n.locale) : null;

  return (
    <BrandTheme>
      <DisplayScreen
        eventName={data?.name ?? "GRAD '26"}
        eventDate={data ? formatEventWhen(data, i18n).date : null}
        wishesQrSvg={wishesQrSvg}
        wishesLink={displayLink(wishesUrl)}
        liveLink={displayLink(`${origin}/live`)}
        captions={parseCaptionSetting(params.captions)}
        messages={pickMessages(i18n.locale, "display.")}
      />
    </BrandTheme>
  );
}
