import type { EventConfig, Rsvp } from "@grad/contract";

/** Date always; clock time only once confirmed (#83), otherwise "time to be confirmed". */
export function formatEventWhen(event: Pick<EventConfig, "startsAt" | "timeZone" | "timeConfirmed">): {
  date: string;
  time: string;
} {
  const at = new Date(event.startsAt);
  const date = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeZone: event.timeZone,
  }).format(at);
  const time = event.timeConfirmed
    ? new Intl.DateTimeFormat("en-GB", { timeStyle: "short", timeZone: event.timeZone }).format(at)
    : "Time to be confirmed";
  return { date, time };
}

export function summarizeRsvp(rsvp: Rsvp | null): string {
  if (rsvp === null) return "You have not responded yet.";
  if (!rsvp.attending) return "You have said you cannot attend.";
  return rsvp.plusOnesCount > 0
    ? `You are attending, with ${rsvp.plusOnesCount} ${rsvp.plusOnesCount === 1 ? "guest" : "guests"}.`
    : "You are attending.";
}
