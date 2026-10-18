import { splitPersonName, type Guest } from "@grad/contract";

/**
 * The name a guest is called by (#170): the header chip and the profile
 * greeting. The API always sends `givenName`; the split is only a fallback for
 * responses that predate it, with the same rules the API and migration 0005 use.
 */
export function guestGivenName(guest: Pick<Guest, "name" | "givenName">): string {
  return guest.givenName?.trim() || splitPersonName(guest.name).givenName;
}
