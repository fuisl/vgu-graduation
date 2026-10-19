/* Gallery thumbnails are immutable, pre-sized derivatives from the media API; a Next image proxy would add a hop. */
/* eslint-disable @next/next/no-img-element */

import type { Metadata } from "next";
import { ArrowUpRightPixel, BrandEyebrow, BrandTheme, Cta, Section } from "@grad/ui";
import { getEvent } from "../lib/api/event";
import { pickMessages } from "../lib/i18n/dictionary";
import { localizeEvent } from "../lib/i18n/event";
import { formatRich } from "../lib/i18n/format";
import { getI18n } from "../lib/i18n/server";
import { getGallery } from "../lib/api/gallery";
import { mediaDerivativeUrl } from "../lib/api/browser-origin";
import { getWishes } from "../lib/api/wishes";
import { buildCalendarLinks } from "../lib/calendar/links";
import { formatEventWhen } from "../lib/invite/format";
import { Countdown } from "./landing-countdown/Countdown";
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

// API origins are read at request time; every helper below caches its own call.
export const dynamic = "force-dynamic";

const TEASER_PHOTOS = 6;
const TEASER_WISHES = 3;

export default async function Home() {
  const [eventResult, galleryResult, wishesResult, i18n] = await Promise.all([getEvent(), getGallery(), getWishes(), getI18n()]);
  const { t, locale } = i18n;
  const event = eventResult.status === "ok" ? localizeEvent(eventResult.data, locale) : null;
  const when = event ? formatEventWhen(event, i18n) : null;
  const links = event ? buildCalendarLinks(event, undefined, { directions: t("calendar.directions") }) : null;
  // "November 20" in English (as before #9), "20 tháng 11" in Vietnamese.
  const day = event
    ? new Intl.DateTimeFormat(locale === "en" ? "en-US" : i18n.intl, { month: "long", day: "numeric", timeZone: event.timeZone }).format(new Date(event.startsAt))
    : null;
  const photos = galleryResult.status === "ok" ? galleryResult.data.items.slice(0, TEASER_PHOTOS) : null;
  const wishes = wishesResult.status === "ok" ? wishesResult.data.items.slice(0, TEASER_WISHES) : null;

  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} current="home" />
      <main className="home">
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
            {/* Two columns read top to bottom: place (campus, city), then date and countdown. */}
            <div className="home-hero-meta">
              <p className="home-hero-meta__cell">
                <a className="home-hero-meta__link" href="/venue">
                  {t("landing.campus")}
                  <ArrowUpRightPixel />
                </a>
              </p>
              <p className="home-hero-meta__cell">{t("landing.city")}</p>
              {event && day ? (
                <>
                  <p className="home-hero-meta__cell"><time dateTime={event.startsAt}>{day}</time></p>
                  <Countdown target={event.startsAt} labels={pickMessages(locale, "landing.countdown.")} />
                </>
              ) : null}
            </div>
          </div>
        </Section>

        <Section tone="white" aria-labelledby="home-when-title">
          <BrandEyebrow>{t("landing.when.eyebrow")}</BrandEyebrow>
          <h2 id="home-when-title" className="home-h2">{t("landing.when.title")}</h2>
          {event && when && links ? (
            <div className="home-when">
              <div className="home-fact">
                <BrandEyebrow>{t("common.when")}</BrandEyebrow>
                <p className="home-fact__main"><time dateTime={event.startsAt}>{when.date}</time></p>
                <p className="home-fact__sub">{when.time}</p>
                {event.timeConfirmed ? null : (
                  <p className="home-note">{t("landing.when.tbc")}</p>
                )}
              </div>
              <div className="home-fact">
                <BrandEyebrow>{t("common.where")}</BrandEyebrow>
                <p className="home-fact__main">{event.venue.name}</p>
                <p className="home-fact__sub">{event.venue.address}</p>
                <div className="home-fact__action">
                  <Cta tone="on-white" variant="secondary" href={event.venue.mapUrl} external>{t("common.directions")}</Cta>
                </div>
              </div>
              <div className="home-actions">
                <Cta tone="on-white" href={links.webcal}>{t("calendar.add")}</Cta>
                <a className="home-link" href="/venue">{t("landing.when.more")}</a>
              </div>
            </div>
          ) : (
            <p className="home-state" role="status">
              {formatRich(t("landing.when.unavailable"), {
                link: <a className="home-link" href="/venue">{t("landing.when.unavailableLink")}</a>,
              })}
            </p>
          )}
        </Section>

        <Section tone="blue" aria-labelledby="home-gallery-title">
          <BrandEyebrow>{t("nav.gallery")}</BrandEyebrow>
          <h2 id="home-gallery-title" className="home-h2">{t("landing.gallery.title")}</h2>
          {photos && photos.length > 0 ? (
            <ul className="home-photos">
              {photos.map((photo) => (
                <li key={photo.publicId}>
                  <img
                    src={mediaDerivativeUrl(photo.publicId, "thumb")}
                    alt={t("common.guestPhoto")}
                    width={400}
                    height={400}
                    loading="lazy"
                    decoding="async"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="home-state" role={photos ? undefined : "status"}>
              {photos ? t("landing.gallery.empty") : t("landing.gallery.unavailable")}
            </p>
          )}
          <div className="home-actions">
            <Cta tone="on-blue" href="/gallery">{t("landing.gallery.open")}</Cta>
            <a className="home-link" href="/memories">{t("landing.gallery.archive")}</a>
          </div>
        </Section>

        <Section tone="white" aria-labelledby="home-wishes-title">
          <BrandEyebrow>{t("nav.wishes")}</BrandEyebrow>
          <h2 id="home-wishes-title" className="home-h2">{t("landing.wishes.title")}</h2>
          {wishes && wishes.length > 0 ? (
            <ul className="home-wishes">
              {wishes.map((wish) => (
                <li key={wish.id} className="home-wish">
                  <blockquote className="home-wish__body">{wish.body}</blockquote>
                  <p className="home-wish__author">{wish.authorName}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="home-state" role={wishes ? undefined : "status"}>
              {wishes ? t("landing.wishes.empty") : t("landing.wishes.unavailable")}
            </p>
          )}
          <div className="home-actions">
            <Cta tone="on-white" href="/wishes">{t("landing.wishes.leave")}</Cta>
            <a className="home-link" href="/wishes">{t("landing.wishes.all")}</a>
          </div>
        </Section>
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
