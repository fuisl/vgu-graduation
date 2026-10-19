import {
  ACCESSIBILITY_NEED_KEYS,
  ACCESSIBILITY_NOTE_MAX_LENGTH,
  type AccessibilityNeedKey,
  type AccessibilityNeeds,
  type GuestRsvp,
} from "@grad/contract";
import type { ApiResult } from "../api/result";
import type { I18n } from "../i18n/dictionary";

export type AccessibilityGroupId = "mobility" | "hearing" | "sight" | "seating";

/**
 * The RSVP form's "Accessibility and assistance" section (#176), grouped the way a
 * guest thinks about it. Every key in ACCESSIBILITY_NEED_KEYS appears exactly once.
 * Legends are `rsvp.a11y.group.<id>` messages and labels `rsvp.a11y.need.<key>` (#9).
 */
export const ACCESSIBILITY_GROUPS: ReadonlyArray<{
  id: AccessibilityGroupId;
  needs: ReadonlyArray<{ key: AccessibilityNeedKey }>;
}> = [
  { id: "mobility", needs: [{ key: "wheelchair" }, { key: "stepFreeAccess" }] },
  { id: "hearing", needs: [{ key: "captions" }, { key: "seatNearSpeakers" }] },
  { id: "sight", needs: [{ key: "largePrint" }, { key: "visionAssistance" }] },
  { id: "seating", needs: [{ key: "seatNearFront" }, { key: "aisleSeat" }, { key: "companion" }] },
];

/** Form field names. `touched` is set by the form once the guest changes anything in the section. */
export const A11Y_TOUCHED_FIELD = "accessibilityTouched";
export const A11Y_NOTE_FIELD = "accessibilityNote";
export function a11yFieldName(key: AccessibilityNeedKey): string {
  return `a11y-${key}`;
}

export const NO_NEEDS: AccessibilityNeeds = {
  wheelchair: false,
  stepFreeAccess: false,
  captions: false,
  seatNearSpeakers: false,
  largePrint: false,
  visionAssistance: false,
  seatNearFront: false,
  aisleSeat: false,
  companion: false,
  note: null,
};

type Fields = { get(name: string): unknown };

export type ParsedAccessibility =
  | { ok: true; accessibility: AccessibilityNeeds | undefined }
  | { ok: false; message: string };

/**
 * Reads the section from submitted fields. Pure.
 * - Untouched: `undefined`, so PUT /rsvp omits `accessibility` and the stored needs stay as they are.
 *   This is what keeps a failed prefill, or a guest who never opened the section, from wiping them.
 * - Touched: the full object. Everything unticked and no note is how a guest clears them; the API
 *   stores that as no needs.
 */
export function parseAccessibilityFields(fields: Fields, { t }: Pick<I18n, "t">): ParsedAccessibility {
  if (fields.get(A11Y_TOUCHED_FIELD) !== "1") return { ok: true, accessibility: undefined };
  const note = String(fields.get(A11Y_NOTE_FIELD) ?? "").trim();
  if (note.length > ACCESSIBILITY_NOTE_MAX_LENGTH) {
    return { ok: false, message: t("rsvp.a11y.noteLength", { max: ACCESSIBILITY_NOTE_MAX_LENGTH }) };
  }
  const accessibility: AccessibilityNeeds = { ...NO_NEEDS, note: note || null };
  for (const key of ACCESSIBILITY_NEED_KEYS) {
    const value = fields.get(a11yFieldName(key));
    accessibility[key] = value === "on" || value === "true";
  }
  return { ok: true, accessibility };
}

/** What GET /rsvp told us: the stored needs (null for none), or that they could not be read. */
export type SavedNeeds = { status: "ok"; needs: AccessibilityNeeds | null } | { status: "unavailable" };

/** Maps getRsvp's result (null without a cookie) to the form's prefill. Pure. */
export function savedNeedsFrom(result: ApiResult<GuestRsvp | null> | null): SavedNeeds {
  if (result?.status === "ok") return { status: "ok", needs: result.data?.accessibility ?? null };
  return { status: "unavailable" };
}

/** How many needs (ticked boxes, plus the note) are stated. */
export function countNeeds(needs: AccessibilityNeeds | null | undefined): number {
  if (!needs) return 0;
  return ACCESSIBILITY_NEED_KEYS.filter((key) => needs[key]).length + (needs.note ? 1 : 0);
}
