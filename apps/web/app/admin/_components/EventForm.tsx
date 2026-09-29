"use client";

import type { EventConfig } from "@grad/contract";
import { useActionState } from "react";
import { IDLE, type EventFormState, type FormValues } from "../../../lib/admin/action-state";
import { formatAdminDateTime, isoToZonedLocal } from "../../../lib/admin/datetime";
import { updateEventAction } from "../actions";
import { Field, FormMessage, valueOf } from "./Field";
import { SubmitButton } from "./SubmitButton";

/** Form values for an event: datetimes shown as wall-clock time in the event's own zone. */
function eventToValues(event: EventConfig): FormValues {
  return {
    name: event.name,
    startsAt: isoToZonedLocal(event.startsAt, event.timeZone),
    endsAt: event.endsAt ? isoToZonedLocal(event.endsAt, event.timeZone) : "",
    timeZone: event.timeZone,
    timeConfirmed: event.timeConfirmed ? "on" : "",
    venueName: event.venue.name,
    venueAddress: event.venue.address,
    venueMapUrl: event.venue.mapUrl,
    contactName: event.contact?.name ?? "",
    contactEmail: event.contact?.email ?? "",
    contactPhone: event.contact?.phone ?? "",
    arrivalInfo: event.arrivalInfo ?? "",
  };
}

export function EventForm({ event }: { event: EventConfig }) {
  const [state, formAction] = useActionState<EventFormState, FormData>(updateEventAction, IDLE);
  const errors = state.status === "error" ? state.errors : {};
  // After a failed submit keep what was typed; otherwise show the stored event.
  const values = state.status === "error" ? state.values : eventToValues(event);
  const v = (name: string) => valueOf(values, name) ?? "";
  const zone = v("timeZone");

  return (
    <>
      {state.status === "saved" ? <SavedEvent event={state.event} /> : null}
      {/* Remount on a new stored event so every uncontrolled input picks up the saved values. */}
      <form key={JSON.stringify(event)} action={formAction} className="admin-form" noValidate aria-label="Edit event">
        {state.status === "error" && state.message ? <FormMessage kind="error">{state.message}</FormMessage> : null}
        {state.status === "error" && !state.message ? (
          <FormMessage kind="error">Some fields need attention. Nothing was saved.</FormMessage>
        ) : null}

        <Field id="event-name" name="name" label="Event name" required defaultValue={v("name")} error={errors.name} />
        <Field
          id="event-time-zone"
          name="timeZone"
          label="Time zone"
          required
          hint="IANA name. Start and end below are local times in this zone."
          defaultValue={v("timeZone")}
          error={errors.timeZone}
        />
        <Field
          id="event-starts-at"
          name="startsAt"
          label={`Starts (${zone || "event time zone"})`}
          type="datetime-local"
          required
          defaultValue={v("startsAt")}
          error={errors.startsAt}
        />
        <Field
          id="event-ends-at"
          name="endsAt"
          label={`Ends (${zone || "event time zone"})`}
          type="datetime-local"
          defaultValue={v("endsAt")}
          error={errors.endsAt}
        />
        <div className="admin-field">
          <label className="admin-check">
            <input type="checkbox" name="timeConfirmed" defaultChecked={v("timeConfirmed") === "on"} />
            <span>Time confirmed (otherwise guests see &ldquo;time to be confirmed&rdquo;)</span>
          </label>
        </div>

        <fieldset className="admin-fieldset">
          <legend>Venue</legend>
          <Field id="event-venue-name" name="venueName" label="Venue name" required defaultValue={v("venueName")} error={errors.venueName} />
          <Field
            id="event-venue-address"
            name="venueAddress"
            label="Address"
            required
            defaultValue={v("venueAddress")}
            error={errors.venueAddress}
          />
          <Field
            id="event-venue-map-url"
            name="venueMapUrl"
            label="Map link"
            type="url"
            required
            defaultValue={v("venueMapUrl")}
            error={errors.venueMapUrl}
          />
        </fieldset>

        <fieldset className="admin-fieldset">
          <legend>Organizer contact (leave all empty for none)</legend>
          <Field id="event-contact-name" name="contactName" label="Contact name" defaultValue={v("contactName")} error={errors.contactName} />
          <Field
            id="event-contact-email"
            name="contactEmail"
            label="Contact email"
            type="email"
            defaultValue={v("contactEmail")}
            error={errors.contactEmail}
          />
          <Field
            id="event-contact-phone"
            name="contactPhone"
            label="Contact phone"
            type="tel"
            defaultValue={v("contactPhone")}
            error={errors.contactPhone}
          />
        </fieldset>

        <Field
          id="event-arrival-info"
          name="arrivalInfo"
          label="Arrival information"
          type="textarea"
          hint="Arrival, parking and similar notes for the venue page."
          defaultValue={v("arrivalInfo")}
          error={errors.arrivalInfo}
        />

        <SubmitButton pendingLabel="Saving…">Save event</SubmitButton>
      </form>
    </>
  );
}

function SavedEvent({ event }: { event: EventConfig }) {
  const rows: [string, string][] = [
    ["Event name", event.name],
    ["Starts", `${formatAdminDateTime(event.startsAt, event.timeZone)} (${event.timeZone})`],
    ["Ends", event.endsAt ? `${formatAdminDateTime(event.endsAt, event.timeZone)} (${event.timeZone})` : "—"],
    ["Time confirmed", event.timeConfirmed ? "Yes" : "No"],
    ["Venue", `${event.venue.name}, ${event.venue.address}`],
    ["Map link", event.venue.mapUrl],
    [
      "Contact",
      event.contact
        ? [event.contact.name, event.contact.email, event.contact.phone].filter(Boolean).join(" · ")
        : "—",
    ],
    ["Arrival information", event.arrivalInfo ?? "—"],
  ];
  return (
    <section className="admin-notice" role="status" aria-labelledby="event-saved-heading">
      <h2 id="event-saved-heading">Saved. Guest pages now show:</h2>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label} style={{ marginBottom: "var(--space-2)" }}>
            <dt className="admin-muted">{label}</dt>
            <dd style={{ margin: 0, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
