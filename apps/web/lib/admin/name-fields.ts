// The module itself, not the package index: this runs in the browser, and the
// index would bring every contract schema and zod along. names.js has no imports.
import { splitPersonName } from "@grad/contract/dist/names.js";

/**
 * Live given/family prefill for the admin name fields (#170). While the admin
 * has not typed in the given or family field, both follow the full name through
 * the contract's `splitPersonName` (the same guess the API and migration 0005
 * make). Once they edit either, the split is theirs and the full name no longer
 * overwrites it, until they ask to split again. Pure, so it is unit-tested.
 */
export interface NameFieldsState {
  full: string;
  given: string;
  family: string;
  /** True once the given/family values are the admin's own, not the live guess. */
  manual: boolean;
}

export type NameFieldsAction =
  | { type: "full"; value: string }
  | { type: "given"; value: string }
  | { type: "family"; value: string }
  | { type: "resplit" };

function guess(full: string): { given: string; family: string } {
  if (!full.trim()) return { given: "", family: "" };
  const { givenName, familyName } = splitPersonName(full);
  return { given: givenName, family: familyName ?? "" };
}

/**
 * Starting state. A new form starts empty and follows the full name. An edit
 * form starts from the stored split, and keeps following the full name only
 * while that split is still exactly the guess (so a custom split is never
 * overwritten by a typo fix in the full name).
 */
export function initialNameFields(full = "", given?: string, family?: string | null): NameFieldsState {
  if (given === undefined) return { full, ...guess(full), manual: false };
  const stored = { given, family: family ?? "" };
  const guessed = guess(full);
  return { full, ...stored, manual: stored.given !== guessed.given || stored.family !== guessed.family };
}

export function nameFieldsReducer(state: NameFieldsState, action: NameFieldsAction): NameFieldsState {
  switch (action.type) {
    case "full":
      return state.manual ? { ...state, full: action.value } : { ...state, full: action.value, ...guess(action.value) };
    case "given":
      return { ...state, given: action.value, manual: true };
    case "family":
      return { ...state, family: action.value, manual: true };
    case "resplit":
      return { ...state, ...guess(state.full), manual: false };
  }
}
