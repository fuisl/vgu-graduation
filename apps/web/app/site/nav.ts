export type SiteNavKey = "home" | "venue" | "gallery" | "wishes";

/** The four guest-facing pages, in display order. Shared by header, sheet and footer. */
export const SITE_NAV: ReadonlyArray<{key: SiteNavKey; href: string; label: string}> = [
  {key: "home", href: "/", label: "Home"},
  {key: "venue", href: "/venue", label: "Venue"},
  {key: "gallery", href: "/gallery", label: "Gallery"},
  {key: "wishes", href: "/wishes", label: "Wishes"},
];

/** Index of the element that should receive focus when Tab is pressed inside a trap. */
export function nextTrapIndex(count: number, active: number, shift: boolean): number {
  if (count <= 0) return -1;
  if (active < 0 || active >= count) return shift ? count - 1 : 0;
  return shift ? (active - 1 + count) % count : (active + 1) % count;
}
