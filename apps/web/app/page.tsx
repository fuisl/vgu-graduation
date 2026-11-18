import type { Metadata } from "next";
import { ArrowUpRightPixel, BrandTheme, Section } from "@grad/ui";
import { pickMessages, type Translator } from "../lib/i18n/dictionary";
import { getI18n } from "../lib/i18n/server";
import { JOURNEY_ENTRIES } from "./journey/entries";
import { JourneyList } from "./journey/JourneyList";
import { isPlaceholder, readyEntries, resolveEntries } from "./journey/view";
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

/** Shown instead of the-journey/ while it has nothing ready: the public features, in the journey's row style. */
const EXPLORE_LINKS = [
  { id: "wall", href: "/wall" },
  { id: "guide", href: "/guide" },
  { id: "venue", href: "/venue" },
  { id: "live", href: "/live" },
  { id: "ascii", href: "/ascii-live" },
] as const;

/**
 * Landing (/), owner brief 2026-11: tell a story; the menu holds where to go. A blue full-viewport hero
 * (sculpture, headline, one line in the owner's voice), then the-journey/, a list of the film and the
 * chapters (docs/design/landing.md). Placeholders never render: the lead shows once it is written, the band
 * keeps only the entries whose words and media exist, and with none of them it shows start-here/, a few
 * links to the public features. The page makes no API call of its own.
 */
export default async function Home() {
  const i18n = await getI18n();
  const { t, locale } = i18n;
  const lead = t("landing.lead");
  const journey = readyEntries(resolveEntries(JOURNEY_ENTRIES, t));

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
            {isPlaceholder(lead) ? null : <p className="home-lead">{lead}</p>}
          </div>
        </Section>

        {journey.length > 0 ? (
          <Section tone="white" density="compact" aria-labelledby="home-journey">
            <h2 id="home-journey" className="journey-title" translate="no">{t("landing.journey.heading")}</h2>
            <JourneyList entries={journey} messages={pickMessages(locale, "landing.journey.ui.")} locale={locale} />
          </Section>
        ) : (
          <Section tone="white" density="compact" aria-labelledby="home-explore">
            <h2 id="home-explore" className="journey-title" translate="no">{t("landing.explore.heading")}</h2>
            <ExploreLinks t={t} />
          </Section>
        )}
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}

function ExploreLinks({ t }: { t: Translator }) {
  return (
    <div className="journey">
      <ul className="journey-links">
        {EXPLORE_LINKS.map((link) => (
          <li key={link.id}>
            <a className="journey-row" href={link.href}>
              <span className="journey-row__stripe" />
              <span className="journey-row__thumb" aria-hidden="true"><ArrowUpRightPixel /></span>
              <span className="journey-row__text">
                <span className="journey-row__title">{t(`landing.explore.${link.id}.title`)}</span>
                <span className="journey-row__description">{t(`landing.explore.${link.id}.description`)}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
