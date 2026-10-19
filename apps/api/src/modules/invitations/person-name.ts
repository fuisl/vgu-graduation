import { splitPersonName } from "@grad/contract";

/** The name columns shared by `guests` and `users` (#170). */
export interface PersonNameColumns {
  givenName: string;
  familyName: string | null;
  nameReviewed: boolean;
}

/**
 * Name columns for a new guest or graduate. An admin who typed the given name
 * has reviewed the split; otherwise it is `splitPersonName`'s guess, unreviewed.
 */
export function namesForCreate(fullName: string, givenName?: string, familyName?: string | null): PersonNameColumns {
  if (givenName) return { givenName, familyName: familyName ?? null, nameReviewed: true };
  return { ...splitPersonName(fullName), nameReviewed: false };
}

export interface NameUpdate {
  name?: string;
  givenName?: string;
  familyName?: string | null;
  nameReviewed?: boolean;
}

/**
 * The name columns a partial update changes (contract: PATCH /admin/invitations/{id}
 * and PATCH /admin/graduates/{id}). Explicit given/family names are stored as
 * reviewed; a new full name alone is re-split, unreviewed; an explicit
 * `nameReviewed` always wins.
 */
export function namesForUpdate(update: NameUpdate): Partial<PersonNameColumns> & { name?: string } {
  const set: Partial<PersonNameColumns> & { name?: string } = {};
  if (update.name !== undefined) set.name = update.name;
  if (update.givenName !== undefined || update.familyName !== undefined) {
    if (update.givenName !== undefined) set.givenName = update.givenName;
    if (update.familyName !== undefined) set.familyName = update.familyName;
    set.nameReviewed = true;
  } else if (update.name !== undefined) {
    Object.assign(set, splitPersonName(update.name), { nameReviewed: false });
  }
  if (update.nameReviewed !== undefined) set.nameReviewed = update.nameReviewed;
  return set;
}
