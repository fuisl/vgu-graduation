import type {I18n} from "../../lib/i18n/dictionary";

/** Pages a header can mark as current. `home` marks nothing: the mark (logo) is the way home. */
export type SiteNavKey = "home" | "venue" | "gallery" | "wishes";

/**
 * The menubar's action destinations, after the event essentials (date and venue, which are the
 * link to /venue). `gallery` is labelled "Camera": /gallery opens the shared camera first.
 * Labels are `nav.<label>` messages.
 */
export const SITE_NAV: ReadonlyArray<{key: SiteNavKey; href: string; label: "camera" | "wishes"}> = [
  {key: "gallery", href: "/gallery", label: "camera"},
  {key: "wishes", href: "/wishes", label: "wishes"},
];

/** The essentials item's destination: date, time, venue, directions and the calendar. */
export const VENUE_HREF = "/venue";

/** A nav item with its label in the page's language, as the client mobile sheet receives it. */
export type SiteNavLink = {key: SiteNavKey; href: string; label: string};

/** The action links with their labels in the page's language. */
export function siteNavLinks({t}: Pick<I18n, "t">): SiteNavLink[] {
  return SITE_NAV.map(({key, href, label}) => ({key, href, label: t(`nav.${label}`)}));
}

/** Index of the element that should receive focus when Tab is pressed inside a trap. */
export function nextTrapIndex(count: number, active: number, shift: boolean): number {
  if (count <= 0) return -1;
  if (active < 0 || active >= count) return shift ? count - 1 : 0;
  return shift ? (active - 1 + count) % count : (active + 1) % count;
}
