import type { Metadata } from "next";
import { ArrowUpRightPixel, BrandEyebrow, BrandTheme, Section } from "@grad/ui";
import { getEvent } from "../lib/api/event";
import { localizeEvent } from "../lib/i18n/event";
import { getI18n } from "../lib/i18n/server";
import { DecodeText } from "./landing-title/DecodeText";
import { LazySculpture } from "./sculpture/LazySculpture";
import { SculptureFallback } from "./sculpture/SculptureFallback";
import { SHAPE_NAMES } from "./sculpture/shapes";
import { SiteFooter } from "./site/SiteFooter";
import { SiteHeader } from "./site/SiteHeader";
import "./landing.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("landing.metaTitle"), description: t("landing.metaDescription") };
}

// API origins are read at request time; getEvent caches its own call (300 s), shared with the header.
export const dynamic = "force-dynamic";

type Entry = { id: "invitation" | "venue" | "camera" | "wishes"; href: string; description: string };

/**
 * Landing (/), owner brief 2026-10: say what the site is for and where to go, nothing else. A blue
 * full-viewport hero (sculpture, headline, one sentence), then four entry points in the order of AGENTS.md:
 * invitation, venue and calendar, then the camera and wishes. Persistent facts and settings live
 * in the menubar; the venue entry repeats the date and venue once because, on a phone, the menubar
 * keeps them inside the Menu sheet.
 */
export default async function Home() {
  const [eventResult, i18n] = await Promise.all([getEvent(), getI18n()]);
  const { t, locale } = i18n;
  const event = eventResult.status === "ok" ? localizeEvent(eventResult.data, locale) : null;
  const date = event
    ? new Intl.DateTimeFormat(i18n.intl, { weekday: "long", day: "numeric", month: "long", timeZone: event.timeZone }).format(new Date(event.startsAt))
    : null;

  const entries: Entry[] = [
    // /me opens the invitation when this device has one, and explains how to open it when not.
    { id: "invitation", href: "/me", description: t("landing.entry.invitation.description") },
    {
      id: "venue",
      href: "/venue",
      description: event && date ? t("landing.entry.venue.when", { date, venue: event.venue.name }) : t("landing.entry.venue.description"),
    },
    // /gallery opens the shared camera first.
    { id: "camera", href: "/gallery", description: t("landing.entry.camera.description") },
    { id: "wishes", href: "/wishes", description: t("landing.entry.wishes.description") },
  ];

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

        <Section tone="white" density="compact" aria-labelledby="home-start">
          <BrandEyebrow>
            <span id="home-start">{t("landing.start")}</span>
          </BrandEyebrow>
          <ul className="home-entries">
            {entries.map((entry) => (
              <li key={entry.id}>
                <a className="home-entry" href={entry.href}>
                  <span className="home-entry__text">
                    <span className="home-entry__title">{t(`landing.entry.${entry.id}.title`)}</span>
                    <span className="home-entry__description">{entry.description}</span>
                  </span>
                  <span className="home-entry__arrow"><ArrowUpRightPixel /></span>
                </a>
              </li>
            ))}
          </ul>
        </Section>
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
