import type { Metadata } from "next";
import { Button, Container } from "@grad/ui";
import { getEvent } from "../../lib/api/event";
import { buildCalendarLinks } from "../../lib/calendar/links";
import { formatEventWhen } from "../../lib/invite/format";

export const metadata: Metadata = {
  title: "Venue and calendar · GRAD '26",
  description: "When and where the ceremony takes place, directions, and how to add it to your calendar.",
};

// PUBLIC_API_ORIGIN is read at request time; the event itself is cached by getEvent (300 s).
export const dynamic = "force-dynamic";

const label = { fontSize: "var(--text-xs)", color: "var(--muted)", margin: 0 } as const;

export default async function VenuePage() {
  const result = await getEvent();

  if (result.status !== "ok") {
    return (
      <main style={{ minHeight: "100svh", padding: "var(--space-6) 0" }}>
        <Container narrow>
          <h1>Venue and calendar</h1>
          <p role="status">
            Event information is temporarily unavailable. Please try again in a moment, or contact an organizer.
          </p>
          <p>
            <a href="/venue">Try again</a>
          </p>
        </Container>
      </main>
    );
  }

  const event = result.data;
  const when = formatEventWhen(event);
  const links = buildCalendarLinks(event);

  return (
    <main style={{ minHeight: "100svh", padding: "var(--space-6) 0" }}>
      <Container narrow>
        <div style={{ display: "grid", gap: "var(--space-6)" }}>
          <h1>{event.name}</h1>

          <section aria-labelledby="when-heading">
            <h2 id="when-heading" className="mono" style={label}>When</h2>
            <p style={{ margin: 0 }}>
              <time dateTime={event.startsAt}>{when.date}</time>
              <br />
              {when.time}
            </p>
            {event.timeConfirmed ? null : (
              <p style={{ ...label, marginTop: "var(--space-2)" }}>
                The date and time may still change. Subscribe to the calendar below to get updates automatically.
              </p>
            )}
          </section>

          <section aria-labelledby="where-heading">
            <h2 id="where-heading" className="mono" style={label}>Where</h2>
            <p style={{ margin: 0 }}>
              {event.venue.name}
              <br />
              {event.venue.address}
            </p>
            <p>
              <a href={event.venue.mapUrl} target="_blank" rel="noopener noreferrer">
                Directions (opens map<span className="sr-only"> in a new tab</span>)
              </a>
            </p>
          </section>

          {event.arrivalInfo ? (
            <section aria-labelledby="arrival-heading">
              <h2 id="arrival-heading" className="mono" style={label}>Arrival</h2>
              <p style={{ margin: 0, whiteSpace: "pre-line" }}>{event.arrivalInfo}</p>
            </section>
          ) : null}

          {event.contact ? (
            <section aria-labelledby="contact-heading">
              <h2 id="contact-heading" className="mono" style={label}>Contact</h2>
              <p style={{ margin: 0 }}>
                {event.contact.name}
                {event.contact.email ? (
                  <>
                    <br />
                    <a href={`mailto:${event.contact.email}`}>{event.contact.email}</a>
                  </>
                ) : null}
                {event.contact.phone ? (
                  <>
                    <br />
                    <a href={`tel:${event.contact.phone.replace(/[^\d+]/g, "")}`}>{event.contact.phone}</a>
                  </>
                ) : null}
              </p>
            </section>
          ) : null}

          <section aria-labelledby="calendar-heading">
            <h2 id="calendar-heading" className="mono" style={label}>Add to your calendar</h2>
            <p>No email needed. Subscribing keeps your calendar up to date if the date or venue changes.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
              <Button href={links.webcal}>Subscribe (Apple / Outlook)</Button>
              <Button href={links.google} variant="outline">Add to Google Calendar</Button>
              <Button href={links.outlook} variant="outline">Add to Outlook</Button>
              <Button href={links.ics} variant="outline">Download .ics</Button>
            </div>
            <p style={{ ...label, marginTop: "var(--space-3)" }}>
              Google Calendar refreshes subscribed calendars slowly (up to a day). The Google and Outlook buttons add a
              one-time copy that will not update, so check this page for the latest details.
            </p>
          </section>
        </div>
      </Container>
    </main>
  );
}
