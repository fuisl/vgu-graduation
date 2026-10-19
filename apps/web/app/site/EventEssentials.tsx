import type {EventConfig} from "@grad/contract";
import {getEvent} from "../../lib/api/event";
import type {I18n} from "../../lib/i18n/dictionary";
import {localizeEvent} from "../../lib/i18n/event";
import {formatEventWhen} from "../../lib/invite/format";

/** `pill`: the desktop header's first nav item. `sheet`: the block at the top of the mobile menu. */
export type EssentialsVariant = "pill" | "sheet";

type Props = {i18n: I18n; variant: EssentialsVariant};

/**
 * The event essentials in the menubar: the date and the venue, the one persistent home of the
 * event facts (owner brief, 2026-10). The item links to /venue, which has the rest. Reads
 * GET /event (cached 300 s, shared with the page). SiteHeader renders it in a Suspense boundary
 * whose fallback is `EssentialsLabel` with no event, so the header never waits on the API and a
 * failed call degrades to a plain "Venue" link.
 */
export async function EventEssentials({i18n, variant}: Props) {
  const result = await getEvent().catch(() => null);
  const event = result?.status === "ok" ? localizeEvent(result.data, i18n.locale) : null;
  return <EssentialsLabel i18n={i18n} variant={variant} event={event} />;
}

/** The label itself, with or without the event (fallback, API down). Server-only, pure. */
export function EssentialsLabel({i18n, variant, event}: Props & {event: EventConfig | null}) {
  const {t, intl} = i18n;
  if (!event) {
    return variant === "pill"
      ? <>{t("nav.venue")}</>
      : <span className="brand-sheet__when-main">{t("header.venueFallback")}</span>;
  }
  const at = new Date(event.startsAt);
  if (variant === "pill") {
    const day = new Intl.DateTimeFormat(intl, {day: "numeric", month: "short", timeZone: event.timeZone}).format(at);
    return (
      <span className="brand-when">
        <time dateTime={event.startsAt}>{day}</time>
        <span className="brand-when__sep" aria-hidden="true">·</span>
        <span className="brand-when__place">{event.venue.name}</span>
        <span className="brand-sr-only">{t("header.venueHint")}</span>
      </span>
    );
  }
  const day = new Intl.DateTimeFormat(intl, {weekday: "long", day: "numeric", month: "long", timeZone: event.timeZone}).format(at);
  const {time} = formatEventWhen(event, i18n);
  return (
    <>
      {/* The eyebrow look on a span: the whole block sits inside the sheet's link. */}
      <span className="brand-eyebrow">{t("header.venueEyebrow")}</span>
      <span className="brand-sheet__when-main"><time dateTime={event.startsAt}>{day}</time></span>
      <span className="brand-sheet__when-sub">{time} · {event.venue.name}</span>
    </>
  );
}
