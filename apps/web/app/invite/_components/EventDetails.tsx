import { Cta } from "@grad/ui";
import type { EventConfig } from "@grad/contract";
import type { ApiResult } from "../../../lib/api/result";
import { buildCalendarLinks } from "../../../lib/calendar/links";
import { pickMessages, type I18n } from "../../../lib/i18n/dictionary";
import { formatEventWhen } from "../../../lib/invite/format";
import { AddToCalendar } from "../../calendar/AddToCalendar";

/**
 * Public event information (GET /event). Safe to show to anyone; no personal data. Reusable by other pages.
 * `event` is already localized (localizeEventResult); the labels follow `i18n` (#9).
 */
export function EventDetails({ event, i18n }: { event: ApiResult<EventConfig>; i18n: I18n }) {
  const { t } = i18n;
  if (event.status !== "ok") {
    return (
      <section aria-labelledby="event-heading" className="invite-body">
        <h2 id="event-heading" className="invite-heading">{t("event.ceremony")}</h2>
        <p role="status">{t("event.unavailable")}</p>
      </section>
    );
  }

  const { data } = event;
  const when = formatEventWhen(data, i18n);
  return (
    <section aria-labelledby="event-heading" className="invite-body">
      <h2 id="event-heading" className="invite-heading">{data.name}</h2>
      <dl className="invite-facts">
        <div>
          <dt>{t("common.when")}</dt>
          <dd>
            <time dateTime={data.startsAt}>{when.date}</time>
            <br />
            {when.time}
          </dd>
        </div>
        <div>
          <dt>{t("venue.calendar")}</dt>
          <dd className="invite-facts__calendar">
            {/* Secondary: the RSVP is this view's primary action (QA P1-3). */}
            <AddToCalendar
              links={buildCalendarLinks(data, undefined, { directions: t("calendar.directions") })}
              messages={pickMessages(i18n.locale, "calendar.")}
              tone="on-white"
              emphasis="secondary"
            />
          </dd>
        </div>
        <div>
          <dt>{t("common.where")}</dt>
          <dd>
            {data.venue.name}
            <br />
            {data.venue.address}
            <br />
            <span className="invite-facts__action">
              <Cta tone="on-white" variant="secondary" href={data.venue.mapUrl} external>{t("common.directions")}</Cta>
            </span>
          </dd>
        </div>
        <div>
          <dt>{t("event.captions")}</dt>
          <dd>
            {t("event.captionsBody")}
            <br />
            <span className="invite-facts__action">
              <Cta tone="on-white" variant="secondary" href="/live">{t("event.captionsLink")}</Cta>
            </span>
          </dd>
        </div>
        {data.arrivalInfo ? (
          <div>
            <dt>{t("common.arrival")}</dt>
            <dd>{data.arrivalInfo}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
