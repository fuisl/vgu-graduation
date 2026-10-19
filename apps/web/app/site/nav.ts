import type {I18n} from "../../lib/i18n/dictionary";

export type SiteNavKey = "home" | "venue" | "gallery" | "wishes";

/** The four guest-facing pages, in display order. Shared by header, sheet and footer; labels are `nav.<key>` messages. */
export const SITE_NAV: ReadonlyArray<{key: SiteNavKey; href: string}> = [
  {key: "home", href: "/"},
  {key: "venue", href: "/venue"},
  {key: "gallery", href: "/gallery"},
  {key: "wishes", href: "/wishes"},
];

/** A nav item with its label in the page's language, as the client mobile sheet receives it. */
export type SiteNavLink = {key: SiteNavKey; href: string; label: string};

/** The four nav links with their labels in the page's language. */
export function siteNavLinks({t}: Pick<I18n, "t">): SiteNavLink[] {
  return SITE_NAV.map((item) => ({...item, label: t(`nav.${item.key}`)}));
}

/** Index of the element that should receive focus when Tab is pressed inside a trap. */
export function nextTrapIndex(count: number, active: number, shift: boolean): number {
  if (count <= 0) return -1;
  if (active < 0 || active >= count) return shift ? count - 1 : 0;
  return shift ? (active - 1 + count) % count : (active + 1) % count;
}
