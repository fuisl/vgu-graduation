import type { Metadata } from "next";
import { BrandEyebrow, BrandTheme, Cta, Section } from "@grad/ui";
import { getEvent } from "../../lib/api/event";
import { buildCalendarLinks } from "../../lib/calendar/links";
import { formatEventWhen } from "../../lib/invite/format";
import { SiteFooter } from "../site/SiteFooter";
import { SiteHeader } from "../site/SiteHeader";
import "./venue.css";

export const metadata: Metadata = {
  title: "Venue and calendar · GRAD '26",
  description: "When and where the ceremony takes place, directions, and how to add it to your calendar.",
};

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
  const links = buildCalendarLinks(event);

  return (
    <BrandTheme>
      <SiteHeader current="venue" />
      <main className="venue-main">
        <Section tone="blue" aria-labelledby="venue-heading">
          <BrandEyebrow>Venue and calendar</BrandEyebrow>
          <h1 id="venue-heading" className="venue-title">{event.name}</h1>
          <div className="venue-hero">
            <section aria-labelledby="when-heading" className="venue-hero__item">
              <h2 id="when-heading" className="venue-label">When</h2>
              <p className="venue-text venue-text--lead">
                <time dateTime={event.startsAt}>{when.date}</time>
                <br />
                {when.time}
              </p>
              {event.timeConfirmed ? null : (
                <p className="venue-note">
                  The date and time may still change. Subscribe to the calendar below to get updates automatically.
                </p>
              )}
            </section>

            <section aria-labelledby="where-heading" className="venue-hero__item">
              <h2 id="where-heading" className="venue-label">Where</h2>
              <p className="venue-text venue-text--lead">
                {event.venue.name}
                <br />
                {event.venue.address}
              </p>
              <p className="venue-text">
                <a className="venue-link" href={event.venue.mapUrl} target="_blank" rel="noopener noreferrer">
                  Directions (opens map<span className="sr-only"> in a new tab</span>)
                </a>
              </p>
            </section>
          </div>
        </Section>

        <Section tone="white" density="compact">
          <div className="venue-body">
            {event.arrivalInfo ? (
              <section aria-labelledby="arrival-heading" className="venue-block">
                <h2 id="arrival-heading" className="venue-label">Arrival</h2>
                <p className="venue-pre">{event.arrivalInfo}</p>
              </section>
            ) : null}

            {event.contact ? (
              <section aria-labelledby="contact-heading" className="venue-block">
                <h2 id="contact-heading" className="venue-label">Contact</h2>
                <p>
                  {event.contact.name}
                  {event.contact.email ? (
                    <>
                      <br />
                      <a className="venue-link venue-link--on-white" href={`mailto:${event.contact.email}`}>{event.contact.email}</a>
                    </>
                  ) : null}
                  {event.contact.phone ? (
                    <>
                      <br />
                      <a className="venue-link venue-link--on-white" href={`tel:${event.contact.phone.replace(/[^\d+]/g, "")}`}>{event.contact.phone}</a>
                    </>
                  ) : null}
                </p>
              </section>
            ) : null}

            <section aria-labelledby="calendar-heading" className="venue-block">
              <h2 id="calendar-heading" className="venue-label">Add to your calendar</h2>
              <p>No email needed. Subscribing keeps your calendar up to date if the date or venue changes.</p>
              <div className="venue-actions">
                <Cta tone="on-white" href={links.webcal}>Subscribe (Apple / Outlook)</Cta>
                <a className="venue-secondary" href={links.google}>Add to Google Calendar</a>
                <a className="venue-secondary" href={links.outlook}>Add to Outlook</a>
                <a className="venue-secondary" href={links.ics}>Download .ics</a>
              </div>
              <p className="venue-note">
                Google Calendar refreshes subscribed calendars slowly (up to a day). The Google and Outlook buttons add a
                one-time copy that will not update, so check this page for the latest details.
              </p>
            </section>
          </div>
        </Section>
      </main>
      <SiteFooter />
    </BrandTheme>
  );
}
