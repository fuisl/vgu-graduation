import { z } from "zod";
import { rsvpSchema } from "./invitations.js";

/** PUT /rsvp: creates or replaces the calling invitation's RSVP. */
export const putRsvpRequestSchema = z.object({
  attending: z.boolean(),
  plusOnesCount: z.number().int().min(0).default(0),
  dietaryRequirements: z.string().max(500).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});
export type PutRsvpRequest = z.infer<typeof putRsvpRequestSchema>;

/** PUT /rsvp: 200 response. The API rejects `plusOnesCount` above the invitation's `maxPlusOnes` with 400. */
export const putRsvpResponseSchema = rsvpSchema;
export type PutRsvpResponse = z.infer<typeof putRsvpResponseSchema>;

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
