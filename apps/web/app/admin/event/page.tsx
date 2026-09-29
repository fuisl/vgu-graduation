import { getEventUncached } from "../../../lib/api/admin";
import { requireAdminSession } from "../../../lib/admin/session";
import { EventForm } from "../_components/EventForm";
import { LoadError } from "../_components/LoadError";

export default async function EventPage() {
  await requireAdminSession();
  // Read uncached so the editor always starts from the stored document.
  const event = await getEventUncached();

  return (
    <>
      <h1>Event</h1>
      <p className="admin-muted">
        The single source for the ceremony date, venue and contact on every guest page and the calendar feed.
      </p>
      {event.status === "ok" ? (
        <EventForm event={event.data} />
      ) : event.status === "empty" ? (
        <p>The event is not configured in the API yet, so there is nothing to edit. Check that the API&apos;s database migrations have run.</p>
      ) : (
        <LoadError what="the event" result={event} />
      )}
    </>
  );
}
