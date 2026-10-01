import type { Metadata } from "next";
import { BrandEyebrow, BrandTheme, Cta, Section } from "@grad/ui";
import { getEvent } from "../../lib/api/event";
import { buildCalendarLinks } from "../../lib/calendar/links";
import { formatEventWhen } from "../../lib/invite/format";
import { SiteFooter } from "../site/SiteFooter";
import { SiteHeader } from "../site/SiteHeader";
import { CalendarEmailForm } from "./CalendarEmailForm";
import { CampusFigure } from "./CampusFigure";
import "./venue.css";

export const metadata: Metadata = {
  title: "Venue and calendar · GRAD '26",
  description: "When and where the ceremony takes place, directions, and how to add it to your calendar.",
};

/** FIG_001 draws the Ceremony Hall; it only shows while the configured venue is that hall. */
const DRAWN_VENUE = /ceremony hall/i;

// PUBLIC_API_ORIGIN is read at request time; the event itself is cached by getEvent (300 s).
export const dynamic = "force-dynamic";

export default async function VenuePage() {
  const result = await getEvent();

  if (result.status !== "ok") {
    return (
      <BrandTheme>
        <SiteHeader current="venue" />
        <main className="venue-main">
          <Section tone="blue" aria-labelledby="venue-heading">
            <BrandEyebrow>Venue</BrandEyebrow>
            <h1 id="venue-heading" className="venue-title">Venue and calendar</h1>
          </Section>
          <Section tone="white" density="compact" narrow>
            <div className="venue-block">
              <p role="status">
                Event information is temporarily unavailable. Please try again in a moment, or contact an organizer.
              </p>
              <p>
                <a className="venue-link venue-link--on-white" href="/venue">Try again</a>
              </p>
            </div>
          </Section>
        </main>
        <SiteFooter />
      </BrandTheme>
    );
  }

  const event = result.data;
  const when = formatEventWhen(event);
  // One line, no year: the page is about this year's ceremony. The clock time shows only once confirmed.
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: event.timeZone })
    .format(new Date(event.startsAt));
  const links = buildCalendarLinks(event);

  const drawn = DRAWN_VENUE.test(event.venue.name);

  return (
    <BrandTheme>
      <SiteHeader current="venue" />
      <main className="venue-main">
        <Section tone="blue" aria-labelledby="venue-heading">
          {/* Desktop: everything on one screen, facts on the left and FIG_001 on the right. */}
          <div className={drawn ? "venue-split" : "venue-split venue-split--solo"}>
            <div className="venue-info">
              <BrandEyebrow>Venue and calendar</BrandEyebrow>
              <h1 id="venue-heading" className="venue-title">{event.name}</h1>

              <div className="venue-facts">
                <section aria-labelledby="when-heading" className="venue-fact">
                  <h2 id="when-heading" className="venue-label">When</h2>
                  <p className="venue-text venue-text--lead">
                    <time dateTime={event.startsAt}>{day}</time>
                    {event.timeConfirmed ? (
                      <>
                        <br />
                        {when.time}
                      </>
                    ) : null}
                  </p>
                  {event.timeConfirmed ? null : (
                    <p className="venue-note">The date and time may still change; this page always shows the latest.</p>
                  )}
                </section>

                <section aria-labelledby="where-heading" className="venue-fact">
                  <h2 id="where-heading" className="venue-label">Where</h2>
                  <p className="venue-text venue-text--lead">
                    {event.venue.name}
                    <br />
                    <span className="venue-text__sub">{event.venue.address}</span>
                  </p>
                  <div className="venue-fact__action">
                    <Cta tone="on-blue" variant="secondary" href={event.venue.mapUrl} external>Directions</Cta>
                  </div>
                </section>
              </div>

              {event.arrivalInfo ? (
                <section aria-labelledby="arrival-heading" className="venue-fact">
                  <h2 id="arrival-heading" className="venue-label">Arrival</h2>
                  <p className="venue-text venue-pre">{event.arrivalInfo}</p>
                </section>
              ) : null}

              {event.contact ? (
                <section aria-labelledby="contact-heading" className="venue-fact">
                  <h2 id="contact-heading" className="venue-label">Contact</h2>
                  <p className="venue-text">
                    {event.contact.name}
                    {event.contact.email ? (
                      <>
                        {" · "}
                        <a className="venue-link" href={`mailto:${event.contact.email}`}>{event.contact.email}</a>
                      </>
                    ) : null}
                    {event.contact.phone ? (
                      <>
                        {" · "}
                        <a className="venue-link" href={`tel:${event.contact.phone.replace(/[^\d+]/g, "")}`}>{event.contact.phone}</a>
                      </>
                    ) : null}
                  </p>
                </section>
              ) : null}

              <CalendarEmailForm icsHref={links.ics} />
            </div>

            {drawn ? (
              <div className="venue-map">
                <CampusFigure />
              </div>
            ) : null}
          </div>
        </Section>
      </main>
      <SiteFooter />
    </BrandTheme>
  );
}
