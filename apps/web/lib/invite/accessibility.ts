import {
  ACCESSIBILITY_NEED_KEYS,
  ACCESSIBILITY_NOTE_MAX_LENGTH,
  type AccessibilityNeedKey,
  type AccessibilityNeeds,
  type GuestRsvp,
} from "@grad/contract";
import type { ApiResult } from "../api/result";

/**
 * The RSVP form's "Accessibility and assistance" section (#176), grouped the way a
 * guest thinks about it. Every key in ACCESSIBILITY_NEED_KEYS appears exactly once.
 */
export const ACCESSIBILITY_GROUPS: ReadonlyArray<{
  legend: string;
  needs: ReadonlyArray<{ key: AccessibilityNeedKey; label: string }>;
}> = [
  {
    legend: "Getting around",
    needs: [
      { key: "wheelchair", label: "I use a wheelchair and need a wheelchair space" },
      { key: "stepFreeAccess", label: "I need step-free access, without stairs" },
    ],
  },
  {
    legend: "Hearing",
    needs: [
      { key: "captions", label: "Captions or live translation on my phone" },
      { key: "seatNearSpeakers", label: "A seat near the speakers" },
    ],
  },
  {
    legend: "Sight",
    needs: [
      { key: "largePrint", label: "A large-print programme" },
      { key: "visionAssistance", label: "Someone to guide me when I arrive" },
    ],
  },
  {
    legend: "Seating",
    needs: [
      { key: "seatNearFront", label: "A seat near the front" },
      { key: "aisleSeat", label: "An aisle seat" },
      { key: "companion", label: "A companion or assistant comes with me and sits with me" },
    ],
  },
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
export function parseAccessibilityFields(fields: Fields): ParsedAccessibility {
  if (fields.get(A11Y_TOUCHED_FIELD) !== "1") return { ok: true, accessibility: undefined };
  const note = String(fields.get(A11Y_NOTE_FIELD) ?? "").trim();
  if (note.length > ACCESSIBILITY_NOTE_MAX_LENGTH) {
    return { ok: false, message: `The accessibility note must be at most ${ACCESSIBILITY_NOTE_MAX_LENGTH} characters.` };
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
