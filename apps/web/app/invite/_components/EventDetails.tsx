import type { EventConfig } from "@grad/contract";
import type { ApiResult } from "../../../lib/api/result";
import { formatEventWhen } from "../../../lib/invite/format";

/** Public event information (GET /event). Safe to show to anyone; no personal data. Reusable by other pages. */
export function EventDetails({ event }: { event: ApiResult<EventConfig> }) {
  if (event.status !== "ok") {
    return (
      <section aria-labelledby="event-heading">
        <h2 id="event-heading">The ceremony</h2>
        <p role="status">
          Event details could not be loaded right now. Please refresh this page in a moment, or contact an organizer.
        </p>
      </section>
    );
  }

  const { data } = event;
  const when = formatEventWhen(data);
  return (
    <section aria-labelledby="event-heading">
      <h2 id="event-heading">{data.name}</h2>
      <dl style={{ display: "grid", gap: "var(--space-3)", margin: 0 }}>
        <div>
          <dt className="mono" style={{ fontSize: "var(--text-xs)", color: "var(--muted)" }}>When</dt>
          <dd style={{ margin: 0 }}>
            <time dateTime={data.startsAt}>{when.date}</time>
            <br />
            {when.time}
          </dd>
        </div>
        <div>
          <dt className="mono" style={{ fontSize: "var(--text-xs)", color: "var(--muted)" }}>Where</dt>
          <dd style={{ margin: 0 }}>
            {data.venue.name}
            <br />
            {data.venue.address}
            <br />
            <a href={data.venue.mapUrl} target="_blank" rel="noopener noreferrer">
              Directions (opens map<span className="sr-only"> in a new tab</span>)
            </a>
          </dd>
        </div>
        {data.arrivalInfo ? (
          <div>
            <dt className="mono" style={{ fontSize: "var(--text-xs)", color: "var(--muted)" }}>Arrival</dt>
            <dd style={{ margin: 0 }}>{data.arrivalInfo}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
