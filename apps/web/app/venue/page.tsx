import type { Metadata } from "next";
import { BrandEyebrow, BrandTheme, Cta, Section } from "@grad/ui";
import { getEvent } from "../../lib/api/event";
import { buildCalendarLinks } from "../../lib/calendar/links";
import { pickMessages } from "../../lib/i18n/dictionary";
import { localizeEvent } from "../../lib/i18n/event";
import { getI18n } from "../../lib/i18n/server";
import { formatEventWhen } from "../../lib/invite/format";
import { SiteFooter } from "../site/SiteFooter";
import { SiteHeader } from "../site/SiteHeader";
import { AddToCalendar } from "../calendar/AddToCalendar";
import { CampusFigure } from "./CampusFigure";
import "./venue.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("venue.metaTitle"), description: t("venue.metaDescription") };
}

/** FIG_001 draws the Ceremony Hall; it only shows while the configured venue is that hall. */
const DRAWN_VENUE = /ceremony hall/i;

// PUBLIC_API_ORIGIN is read at request time; the event itself is cached by getEvent (300 s).
export const dynamic = "force-dynamic";

export default async function VenuePage() {
  const [result, i18n] = await Promise.all([getEvent(), getI18n()]);
  const { t, locale } = i18n;

  if (result.status !== "ok") {
    return (
      <BrandTheme>
        <SiteHeader i18n={i18n} current="venue" />
        <main id="main" className="venue-main">
          <Section tone="blue" aria-labelledby="venue-heading">
            <BrandEyebrow>{t("nav.venue")}</BrandEyebrow>
            <h1 id="venue-heading" className="venue-title">{t("venue.title")}</h1>
          </Section>
          <Section tone="white" density="compact" narrow>
            <div className="venue-block">
              <p role="status">{t("venue.unavailable")}</p>
              <p>
                <a className="venue-link venue-link--on-white" href="/venue">{t("common.tryAgain")}</a>
              </p>
            </div>
          </Section>
        </main>
        <SiteFooter i18n={i18n} />
      </BrandTheme>
    );
  }

  const event = localizeEvent(result.data, locale);
  const when = formatEventWhen(event, i18n);
  // One line, no year: the page is about this year's ceremony. The clock time shows only once confirmed.
  const day = new Intl.DateTimeFormat(i18n.intl, { weekday: "long", day: "numeric", month: "long", timeZone: event.timeZone })
    .format(new Date(event.startsAt));
  const links = buildCalendarLinks(event, undefined, { directions: t("calendar.directions") });

  const drawn = DRAWN_VENUE.test(event.venue.name);

  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} current="venue" />
      <main id="main" className="venue-main">
        <Section tone="blue" aria-labelledby="venue-heading">
          {/* Desktop: everything on one screen, facts on the left and FIG_001 on the right. */}
          <div className={drawn ? "venue-split" : "venue-split venue-split--solo"}>
            <div className="venue-info">
              <BrandEyebrow>{t("venue.title")}</BrandEyebrow>
              <h1 id="venue-heading" className="venue-title">{event.name}</h1>

              <div className="venue-facts">
                <section aria-labelledby="when-heading" className="venue-fact">
                  <h2 id="when-heading" className="venue-label">{t("common.when")}</h2>
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
                    <p className="venue-note">{t("venue.tbc")}</p>
                  )}
                </section>

                <section aria-labelledby="where-heading" className="venue-fact">
                  <h2 id="where-heading" className="venue-label">{t("common.where")}</h2>
                  <p className="venue-text venue-text--lead">
                    {event.venue.name}
                    <br />
                    <span className="venue-text__sub">{event.venue.address}</span>
                  </p>
                  <div className="venue-fact__action">
                    <Cta tone="on-blue" variant="secondary" href={event.venue.mapUrl} external>{t("common.directions")}</Cta>
                  </div>
                </section>
              </div>

              {event.arrivalInfo ? (
                <section aria-labelledby="arrival-heading" className="venue-fact">
                  <h2 id="arrival-heading" className="venue-label">{t("common.arrival")}</h2>
                  <p className="venue-text venue-pre">{event.arrivalInfo}</p>
                </section>
              ) : null}

              {event.contact ? (
                <section aria-labelledby="contact-heading" className="venue-fact">
                  <h2 id="contact-heading" className="venue-label">{t("common.contact")}</h2>
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

              {/* CalendarEmailForm stays out until the invite email really sends (#150, QA P1-3). */}
              <section aria-labelledby="calendar-heading" className="venue-fact">
                <h2 id="calendar-heading" className="venue-label">{t("venue.calendar")}</h2>
                <AddToCalendar links={links} messages={pickMessages(locale, "calendar.")} tone="on-blue" />
              </section>
            </div>

            {drawn ? (
              <div className="venue-map">
                <CampusFigure i18n={i18n} />
              </div>
            ) : null}
          </div>
        </Section>
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
