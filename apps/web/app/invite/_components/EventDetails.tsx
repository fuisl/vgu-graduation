import { Cta } from "@grad/ui";
import type { EventConfig } from "@grad/contract";
import type { ApiResult } from "../../../lib/api/result";
import { formatEventWhen } from "../../../lib/invite/format";

/** Public event information (GET /event). Safe to show to anyone; no personal data. Reusable by other pages. */
export function EventDetails({ event }: { event: ApiResult<EventConfig> }) {
  if (event.status !== "ok") {
    return (
      <section aria-labelledby="event-heading" className="invite-body">
        <h2 id="event-heading" className="invite-heading">The ceremony</h2>
        <p role="status">
          Event details could not be loaded right now. Please refresh this page in a moment, or contact an organizer.
        </p>
      </section>
    );
  }

  const { data } = event;
  const when = formatEventWhen(data);
  return (
    <section aria-labelledby="event-heading" className="invite-body">
      <h2 id="event-heading" className="invite-heading">{data.name}</h2>
      <dl className="invite-facts">
        <div>
          <dt>When</dt>
          <dd>
            <time dateTime={data.startsAt}>{when.date}</time>
            <br />
            {when.time}
          </dd>
        </div>
        <div>
          <dt>Where</dt>
          <dd>
            {data.venue.name}
            <br />
            {data.venue.address}
            <br />
            <span className="invite-facts__action">
              <Cta tone="on-white" variant="secondary" href={data.venue.mapUrl} external>Directions</Cta>
            </span>
          </dd>
        </div>
        {data.arrivalInfo ? (
          <div>
            <dt>Arrival</dt>
            <dd>{data.arrivalInfo}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
