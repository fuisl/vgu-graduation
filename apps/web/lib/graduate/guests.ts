import type { GraduateGuest, GraduateGuestStatus } from "@grad/contract";

export type GuestSummary = Record<GraduateGuestStatus, number>;

/** The dashboard's counts, derived from the same list it shows, so the two can't disagree. */
export function summarizeGuests(guests: readonly Pick<GraduateGuest, "status">[]): GuestSummary {
  const summary: GuestSummary = { attending: 0, declined: 0, pending: 0 };
  for (const guest of guests) summary[guest.status] += 1;
  return summary;
}

export type GuestFilter = "all" | GraduateGuestStatus;

/** Search by name or email, ignoring case and Vietnamese diacritics, then filter by answer. */
export function filterGuests<T extends Pick<GraduateGuest, "name" | "email" | "status">>(guests: readonly T[], query: string, filter: GuestFilter): T[] {
  const needle = fold(query.trim());
  return guests.filter((guest) => {
    if (filter !== "all" && guest.status !== filter) return false;
    if (!needle) return true;
    return fold(guest.name).includes(needle) || fold(guest.email ?? "").includes(needle);
  });
}

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}
