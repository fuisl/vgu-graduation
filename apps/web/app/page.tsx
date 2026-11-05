import type { Metadata } from "next";
import { BrandTheme, Section } from "@grad/ui";
import { pickMessages } from "../lib/i18n/dictionary";
import { getI18n } from "../lib/i18n/server";
import { JOURNEY_ENTRIES } from "./journey/entries";
import { JourneyList } from "./journey/JourneyList";
import { resolveEntries } from "./journey/view";
import { DecodeText } from "./landing-title/DecodeText";
import { LazySculpture } from "./sculpture/LazySculpture";
import { SculptureFallback } from "./sculpture/SculptureFallback";
import { SHAPE_NAMES } from "./sculpture/shapes";
import { SiteFooter } from "./site/SiteFooter";
import { SiteHeader } from "./site/SiteHeader";
import "./landing.css";
import "./journey/journey.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("landing.metaTitle"), description: t("landing.metaDescription") };
}

// The language comes from the request, and the header reads the API at request time.
export const dynamic = "force-dynamic";

/**
 * Landing (/), owner brief 2026-11: tell a story; the menu holds where to go. A blue full-viewport hero
 * (sculpture, headline, one line in the owner's voice), then the-journey/, a list of the film and the
 * chapters (docs/design/landing.md). The page makes no API call of its own.
 */
export default async function Home() {
  const i18n = await getI18n();
  const { t, locale } = i18n;

  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} current="home" />
      <main id="main" className="home">
        <Section tone="blue" aria-labelledby="home-title">
          <div className="home-stage">
            <div className="home-visual">
              {/* The static motif is server-rendered (it is the LCP element); the canvas loads after idle (QA P1-4). */}
              <LazySculpture label={t("landing.sculpture")}>
                <SculptureFallback label={t("landing.sculpture", { name: SHAPE_NAMES[0] ?? "" })} />
              </LazySculpture>
            </div>
          </div>
          <div className="home-hero-foot">
            <h1 id="home-title" className="home-title" aria-label={t("landing.title")}>
              <DecodeText text={t("landing.title")} delay={80} duration={900} ariaHidden />
            </h1>
            <p className="home-lead">{t("landing.lead")}</p>
          </div>
        </Section>

        <Section tone="white" density="compact" aria-labelledby="home-journey">
          <h2 id="home-journey" className="journey-title" translate="no">{t("landing.journey.heading")}</h2>
          <JourneyList
            entries={resolveEntries(JOURNEY_ENTRIES, t)}
            messages={pickMessages(locale, "landing.journey.ui.")}
            locale={locale}
          />
        </Section>
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
