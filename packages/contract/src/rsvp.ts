import { z } from "zod";
import { timestampSchema } from "./common.js";
import { rsvpSchema } from "./invitations.js";

/** Longest free-text accessibility note, matching the database CHECK. */
export const ACCESSIBILITY_NOTE_MAX_LENGTH = 500;

/**
 * Optional accessibility needs a guest gives with their RSVP (#176). Sensitive:
 * readable by the guest themselves (GET /rsvp) and by admins (GET
 * /admin/rsvp/accessibility) only, never cached publicly, never logged, never
 * part of GET /invitations/me. Retention follows principles.md §8; a guest can
 * clear theirs at any time by sending `accessibility: null`.
 */
export const accessibilityNeedsSchema = z.object({
  /** Uses a wheelchair: needs a wheelchair space. */
  wheelchair: z.boolean(),
  /** Needs step-free access (no stairs) to the venue and seating. */
  stepFreeAccess: z.boolean(),
  /** Hearing: captions or live translation on their phone. */
  captions: z.boolean(),
  /** Hearing: a seat near the speakers. */
  seatNearSpeakers: z.boolean(),
  /** Vision: large-print programme and signage. */
  largePrint: z.boolean(),
  /** Vision: someone to guide them on arrival. */
  visionAssistance: z.boolean(),
  /** Seating near the front. */
  seatNearFront: z.boolean(),
  /** An aisle seat. */
  aisleSeat: z.boolean(),
  /** Comes with a companion or personal assistant who should sit with them. */
  companion: z.boolean(),
  /** Anything else, in the guest's words. */
  note: z.string().max(ACCESSIBILITY_NOTE_MAX_LENGTH).nullable(),
});
export type AccessibilityNeeds = z.infer<typeof accessibilityNeedsSchema>;

/**
 * The same needs as a request body: every flag defaults to false and the note
 * is trimmed (the API stores empty text as null).
 */
export const accessibilityNeedsInputSchema = z.object({
  wheelchair: z.boolean().default(false),
  stepFreeAccess: z.boolean().default(false),
  captions: z.boolean().default(false),
  seatNearSpeakers: z.boolean().default(false),
  largePrint: z.boolean().default(false),
  visionAssistance: z.boolean().default(false),
  seatNearFront: z.boolean().default(false),
  aisleSeat: z.boolean().default(false),
  companion: z.boolean().default(false),
  note: z.string().trim().max(ACCESSIBILITY_NOTE_MAX_LENGTH).nullable().default(null),
});
export type AccessibilityNeedsInput = z.input<typeof accessibilityNeedsInputSchema>;

/** The boolean needs, in display order: what the admin summary counts. */
export const ACCESSIBILITY_NEED_KEYS = [
  "wheelchair",
  "stepFreeAccess",
  "captions",
  "seatNearSpeakers",
  "largePrint",
  "visionAssistance",
  "seatNearFront",
  "aisleSeat",
  "companion",
] as const satisfies readonly (keyof AccessibilityNeeds)[];
export type AccessibilityNeedKey = (typeof ACCESSIBILITY_NEED_KEYS)[number];

/** Whether a needs object says anything at all; an empty one is stored as no needs. */
export function hasAccessibilityNeeds(needs: AccessibilityNeeds | null | undefined): boolean {
  if (!needs) return false;
  return ACCESSIBILITY_NEED_KEYS.some((key) => needs[key]) || Boolean(needs.note);
}

/**
 * PUT /rsvp: creates or replaces the calling invitation's RSVP.
 * `accessibility`: omitted keeps what is stored (so a form that doesn't show
 * it never wipes it), `null` clears it, an object replaces it. An object with
 * nothing set is the same as `null`.
 */
export const putRsvpRequestSchema = z.object({
  attending: z.boolean(),
  plusOnesCount: z.number().int().min(0).default(0),
  dietaryRequirements: z.string().max(500).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  accessibility: accessibilityNeedsInputSchema.nullable().optional(),
});
export type PutRsvpRequest = z.infer<typeof putRsvpRequestSchema>;

/** The guest's own RSVP including their accessibility needs (null when none). */
export const guestRsvpSchema = rsvpSchema.extend({
  accessibility: accessibilityNeedsSchema.nullable(),
});
export type GuestRsvp = z.infer<typeof guestRsvpSchema>;

/**
 * PUT /rsvp: 200 response. The API rejects `plusOnesCount` above the invitation's
 * `maxPlusOnes` with 400. `accessibility` is always sent by the API (optional
 * here only so older fixtures still parse). `Cache-Control: no-store`.
 */
export const putRsvpResponseSchema = rsvpSchema.extend({
  accessibility: accessibilityNeedsSchema.nullable().optional(),
});
export type PutRsvpResponse = z.infer<typeof putRsvpResponseSchema>;

/**
 * GET /rsvp (invitation credential): the guest reads back their own answer,
 * including accessibility needs; `rsvp` is null before they respond. Never
 * cached (`no-store`), unlike GET /invitations/me. Errors as PUT /rsvp.
 */
export const getRsvpResponseSchema = z.object({ rsvp: guestRsvpSchema.nullable() });
export type GetRsvpResponse = z.infer<typeof getRsvpResponseSchema>;

/** One row of GET /admin/rsvp; `rsvp` is null until the guest responds. Admin only (contains guest PII). */
export const adminRsvpRowSchema = z.object({
  invitationId: z.string().uuid(),
  guestName: z.string(),
  maxPlusOnes: z.number().int().min(0),
  rsvp: rsvpSchema.nullable(),
});
export type AdminRsvpRow = z.infer<typeof adminRsvpRowSchema>;

export const adminRsvpListResponseSchema = z.object({ items: z.array(adminRsvpRowSchema) });
export type AdminRsvpListResponse = z.infer<typeof adminRsvpListResponseSchema>;

const count = z.number().int().min(0);

/** One guest with stated needs, for the event team. Admin only, sensitive. */
export const adminAccessibilityRowSchema = z.object({
  invitationId: z.string().uuid(),
  guestName: z.string(),
  attending: z.boolean(),
  plusOnesCount: z.number().int().min(0),
  accessibility: accessibilityNeedsSchema,
  updatedAt: timestampSchema,
});
export type AdminAccessibilityRow = z.infer<typeof adminAccessibilityRowSchema>;

/**
 * Counts for planning the hall: attending guests on active invitations only.
 * `guests` is how many of them stated any need; `withNote` how many wrote a note.
 */
export const accessibilitySummarySchema = z.object({
  guests: count,
  withNote: count,
  needs: z.object(
    Object.fromEntries(ACCESSIBILITY_NEED_KEYS.map((key) => [key, count])) as Record<AccessibilityNeedKey, typeof count>,
  ),
});
export type AccessibilitySummary = z.infer<typeof accessibilitySummarySchema>;

/**
 * GET /admin/rsvp/accessibility: every RSVP on an active invitation that states
 * a need, sorted by guest name, plus the event summary. Admin only, `no-store`.
 */
export const adminAccessibilityResponseSchema = z.object({
  summary: accessibilitySummarySchema,
  items: z.array(adminAccessibilityRowSchema),
});
export type AdminAccessibilityResponse = z.infer<typeof adminAccessibilityResponseSchema>;
