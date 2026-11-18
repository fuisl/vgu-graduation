import type {Metadata} from "next";
import {BrandTheme} from "@grad/ui";
import {pickMessages} from "../../../lib/i18n/dictionary";
import {getI18n} from "../../../lib/i18n/server";
import {SiteFooter} from "../../site/SiteFooter";
import {SiteHeader} from "../../site/SiteHeader";
import {Wall} from "./Wall";
import {parseMode, parseShow} from "./wall-logic";

export async function generateMetadata(): Promise<Metadata> {
  const {t} = await getI18n();
  return {title: t("wall.metaTitle"), description: t("wall.lead")};
}

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The Wall (ADR-019): wishes and instant photos on one public page, where anyone can post.
 * `?mode=photo` opens the camera, `?show=wishes|photos` picks a filter; /wishes, /gallery and
 * /polaroid redirect here. The curated archive stays at /memories.
 */
export default async function WallPage({searchParams}: {searchParams?: Promise<SearchParams>}) {
  const i18n = await getI18n();
  const params = (await searchParams) ?? {};
  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} current="wall" />
      <main id="main">
        <Wall
          messages={pickMessages(i18n.locale, "wall.", "wishes.", "camera.", "gallery.", "print.")}
          intl={i18n.intl}
          initialMode={parseMode(params.mode)}
          initialShow={parseShow(params.show)}
        />
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
