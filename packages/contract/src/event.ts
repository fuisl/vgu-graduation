import { z } from "zod";
import { timestampSchema } from "./common.js";

/**
 * GET /event: the single public event configuration document. Nothing else may
 * hard-code the ceremony date or venue; `timeConfirmed` is false while the
 * working placeholder is in use (#83), so pages can say "time to be confirmed".
 * GET /event/calendar.ics returns `text/calendar` generated from this document
 * and has no JSON schema.
 */
export const eventSchema = z.object({
  name: z.string().min(1),
  /**
   * Vietnamese versions of the prose fields (#9, ADR-010). The site shows them to guests reading
   * in Vietnamese and falls back to the English field when they are null or absent. Optional on
   * the wire so an older API or client still validates. The venue name stays one proper noun.
   */
  nameVi: z.string().min(1).nullable().optional(),
  startsAt: timestampSchema,
  endsAt: timestampSchema.nullable(),
  timeZone: z.string().min(1),
  timeConfirmed: z.boolean(),
  venue: z.object({
    name: z.string().min(1),
    address: z.string().min(1),
    addressVi: z.string().min(1).nullable().optional(),
    mapUrl: z.string().url(),
  }),
  contact: z
    .object({
      name: z.string().min(1),
      email: z.string().email().nullable(),
      phone: z.string().nullable(),
    })
    .nullable(),
  /** Arrival, parking and similar notes shown on the venue page and the static fallback. */
  arrivalInfo: z.string().nullable(),
  arrivalInfoVi: z.string().nullable().optional(),
});
export type EventConfig = z.infer<typeof eventSchema>;

/**
 * PUT /admin/event: replaces the event configuration (#33, edited from #42).
 * Every successful write bumps the calendar feed's SEQUENCE. Response is `eventSchema`.
 */
export const updateEventRequestSchema = eventSchema.refine(
  (event) => event.endsAt === null || Date.parse(event.endsAt) > Date.parse(event.startsAt),
  { message: "endsAt must be after startsAt", path: ["endsAt"] },
);
export type UpdateEventRequest = z.infer<typeof updateEventRequestSchema>;
