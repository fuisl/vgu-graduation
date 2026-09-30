/* Gallery thumbnails are immutable, pre-sized derivatives from the media API; a Next image proxy would add a hop. */
/* eslint-disable @next/next/no-img-element */

import type { Metadata } from "next";
import { BrandEyebrow, BrandTheme, Cta, Section } from "@grad/ui";
import { getEvent } from "../lib/api/event";
import { getGallery } from "../lib/api/gallery";
import { mediaDerivativeUrl } from "../lib/api/browser-origin";
import { getWishes } from "../lib/api/wishes";
import { buildCalendarLinks } from "../lib/calendar/links";
import { formatEventWhen } from "../lib/invite/format";
import { DecodeText } from "./landing-title/DecodeText";
import { Sculpture } from "./sculpture/Sculpture";
import { SiteFooter } from "./site/SiteFooter";
import { SiteHeader } from "./site/SiteHeader";
import "./landing.css";

export const metadata: Metadata = {
  title: "GRAD '26 · VGU graduation",
  description: "The digital companion for the VGU graduation ceremony: invitation, venue, gallery and wishes.",
};

// API origins are read at request time; every helper below caches its own call.
export const dynamic = "force-dynamic";

const TEASER_PHOTOS = 6;
const TEASER_WISHES = 3;

export default async function Home() {
  const [eventResult, galleryResult, wishesResult] = await Promise.all([getEvent(), getGallery(), getWishes()]);
  const event = eventResult.status === "ok" ? eventResult.data : null;
  const when = event ? formatEventWhen(event) : null;
  const links = event ? buildCalendarLinks(event) : null;
  const photos = galleryResult.status === "ok" ? galleryResult.data.items.slice(0, TEASER_PHOTOS) : null;
  const wishes = wishesResult.status === "ok" ? wishesResult.data.items.slice(0, TEASER_WISHES) : null;

  return (
    <BrandTheme>
      <SiteHeader current="home" />
      <main className="home">
        <Section tone="blue" aria-labelledby="home-title">
          <div className="home-stage">
            <div className="home-visual">
              <Sculpture />
            </div>
          </div>
          <div className="home-hero-foot">
            <h1 id="home-title" className="home-title" aria-label="Graduation ’26">
              <DecodeText text="Graduation ’26" delay={80} duration={900} ariaHidden />
            </h1>
            <div className="home-hero-side">
              {event && when ? (
                <p className="home-event-line">
                  <time dateTime={event.startsAt}>{when.date}</time>
                  <br />
                  {event.venue.name}
                </p>
              ) : null}
              <Cta tone="on-blue" href="/invite">Your invitation</Cta>
            </div>
          </div>
        </Section>

        <Section tone="white" aria-labelledby="home-when-title">
          <BrandEyebrow>When and where</BrandEyebrow>
          <h2 id="home-when-title" className="home-h2">Join us on the day</h2>
          {event && when && links ? (
            <div className="home-when">
              <div className="home-fact">
                <BrandEyebrow>When</BrandEyebrow>
                <p className="home-fact__main"><time dateTime={event.startsAt}>{when.date}</time></p>
                <p className="home-fact__sub">{when.time}</p>
                {event.timeConfirmed ? null : (
                  <p className="home-note">The date and time may still change. Add the calendar feed to get updates automatically.</p>
                )}
              </div>
              <div className="home-fact">
                <BrandEyebrow>Where</BrandEyebrow>
                <p className="home-fact__main">{event.venue.name}</p>
                <p className="home-fact__sub">{event.venue.address}</p>
                <div className="home-fact__action">
                  <Cta tone="on-white" variant="secondary" href={event.venue.mapUrl} external>Directions</Cta>
                </div>
              </div>
              <div className="home-actions">
                <Cta tone="on-white" href={links.webcal}>Add to calendar</Cta>
                <a className="home-link" href="/venue">All calendar options and arrival details</a>
              </div>
            </div>
          ) : (
            <p className="home-state" role="status">
              Event details are temporarily unavailable. <a className="home-link" href="/venue">Open the venue page</a> to try again.
            </p>
          )}
        </Section>

        <Section tone="blue" aria-labelledby="home-gallery-title">
          <BrandEyebrow>Gallery</BrandEyebrow>
          <h2 id="home-gallery-title" className="home-h2">Latest photos</h2>
          {photos && photos.length > 0 ? (
            <ul className="home-photos">
              {photos.map((photo) => (
                <li key={photo.publicId}>
                  <img
                    src={mediaDerivativeUrl(photo.publicId, "thumb")}
                    alt="Guest photo"
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
              {photos ? "First photos appear on ceremony day." : "Photos are temporarily unavailable."}
            </p>
          )}
          <div className="home-actions">
            <Cta tone="on-blue" href="/gallery">Open gallery</Cta>
          </div>
        </Section>

        <Section tone="white" aria-labelledby="home-wishes-title">
          <BrandEyebrow>Wishes</BrandEyebrow>
          <h2 id="home-wishes-title" className="home-h2">Words for the class of 2026</h2>
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
              {wishes ? "Be the first to leave a wish." : "Wishes are temporarily unavailable."}
            </p>
          )}
          <div className="home-actions">
            <Cta tone="on-white" href="/wishes">Leave a wish</Cta>
            <a className="home-link" href="/wishes">Read all wishes</a>
          </div>
        </Section>
      </main>
      <SiteFooter />
    </BrandTheme>
  );
}
