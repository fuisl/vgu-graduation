import type { EventConfig, Rsvp } from "@grad/contract";
import type { I18n } from "../i18n/dictionary";

/** Date always; clock time only once confirmed (#83), otherwise "time to be confirmed". In the page's language (#9). */
export function formatEventWhen(
  event: Pick<EventConfig, "startsAt" | "timeZone" | "timeConfirmed">,
  { intl, t }: Pick<I18n, "intl" | "t">,
): {
  date: string;
  time: string;
} {
  const at = new Date(event.startsAt);
  const date = new Intl.DateTimeFormat(intl, {
    dateStyle: "full",
    timeZone: event.timeZone,
  }).format(at);
  const time = event.timeConfirmed
    ? new Intl.DateTimeFormat(intl, { timeStyle: "short", timeZone: event.timeZone }).format(at)
    : t("common.timeTbc");
  return { date, time };
}

export function summarizeRsvp(rsvp: Rsvp | null, { t }: Pick<I18n, "t">): string {
  if (rsvp === null) return t("rsvp.summary.none");
  if (!rsvp.attending) return t("rsvp.summary.declined");
  return rsvp.plusOnesCount > 0 ? t.plural("rsvp.summary.attendingWith", rsvp.plusOnesCount) : t("rsvp.summary.attending");
}
