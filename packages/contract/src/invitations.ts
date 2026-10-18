import { z } from "zod";

/**
 * `name` is the full display name. `givenName` is what the guest is called by
 * (the header chip, greetings) and `familyName` may be null (#170). Both are
 * always sent by the API; they are optional here only so clients and fixtures
 * that predate them still parse.
 */
export const guestSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  givenName: z.string().min(1).optional(),
  familyName: z.string().nullable().optional(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
});
export type Guest = z.infer<typeof guestSchema>;

export const inviterSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
});
export type Inviter = z.infer<typeof inviterSchema>;

export const rsvpSchema = z.object({
  id: z.string().uuid(),
  attending: z.boolean(),
  plusOnesCount: z.number().int().min(0),
  dietaryRequirements: z.string().nullable(),
  notes: z.string().nullable(),
  updatedAt: z.string(),
});
export type Rsvp = z.infer<typeof rsvpSchema>;

/** GET /invitations/me — 200 response */
export const invitationSchema = z.object({
  id: z.string().uuid(),
  guest: guestSchema,
  maxPlusOnes: z.number().int().min(0),
  status: z.enum(["active", "revoked"]),
  validFrom: z.string().nullable(),
  validUntil: z.string().nullable(),
  inviters: z.array(inviterSchema),
  rsvp: rsvpSchema.nullable(),
});
export type Invitation = z.infer<typeof invitationSchema>;

const personNameSchema = z.string().trim().min(1).max(120);

/**
 * POST /admin/invitations — request body. `guestName` is the full display name.
 * When `guestGivenName` is omitted the API splits `guestName` with
 * `splitPersonName` and leaves the guest `nameReviewed: false` for review.
 */
export const createInvitationRequestSchema = z.object({
  guestName: z.string().min(1),
  guestGivenName: personNameSchema.optional(),
  guestFamilyName: personNameSchema.nullable().optional(),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().optional(),
  inviterUserIds: z.array(z.string().uuid()).min(1),
  maxPlusOnes: z.number().int().min(0).optional(),
});
export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;

/** POST /admin/invitations — 201 response */
export const createInvitationResponseSchema = z.object({
  invitationId: z.string().uuid(),
  token: z.string(),
  inviteUrl: z.string().url(),
  guest: guestSchema,
  maxPlusOnes: z.number().int().min(0),
  inviterUserIds: z.array(z.string().uuid()),
});
export type CreateInvitationResponse = z.infer<typeof createInvitationResponseSchema>;

/** POST /admin/invitations/{id}/rotate — 200 response */
export const rotateInvitationResponseSchema = z.object({
  token: z.string(),
  inviteUrl: z.string().url(),
});
export type RotateInvitationResponse = z.infer<typeof rotateInvitationResponseSchema>;

/** POST /admin/invitations/{id}/revoke: 200 response. Revoking twice is a no-op that returns the same state. */
export const revokeInvitationResponseSchema = z.object({
  id: z.string().uuid(),
  status: z.literal("revoked"),
  revokedAt: z.string().datetime({ offset: true }),
});
export type RevokeInvitationResponse = z.infer<typeof revokeInvitationResponseSchema>;

/**
 * A guest as admins see it. `nameReviewed` is false while `givenName` and
 * `familyName` are the API's guess (migration backfill, or a create with only a
 * full name), so the admin UI can ask for a check. Always sent by the API.
 */
export const adminGuestSchema = guestSchema.extend({ nameReviewed: z.boolean().optional() });
export type AdminGuest = z.infer<typeof adminGuestSchema>;

/**
 * PATCH /admin/invitations/{id}: edits the guest and the invitation. Every field
 * is optional; omitted fields stay as they are, `null` clears a nullable one.
 * - Sending `guestGivenName` or `guestFamilyName` stores the split as reviewed.
 * - Sending only `guestName` re-splits it with `splitPersonName`, unreviewed.
 * - `nameReviewed` set explicitly wins (`{ nameReviewed: true }` confirms the split).
 * Lowering `maxPlusOnes` below the plus-ones already in the RSVP is 409.
 * Audited as `invitation.update` with the changed field names only.
 */
export const updateInvitationRequestSchema = z
  .object({
    guestName: personNameSchema,
    guestGivenName: personNameSchema,
    guestFamilyName: personNameSchema.nullable(),
    guestEmail: z.string().trim().email().nullable(),
    guestPhone: z.string().trim().min(1).max(40).nullable(),
    maxPlusOnes: z.number().int().min(0).max(20),
    nameReviewed: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: "Nothing to update" });
export type UpdateInvitationRequest = z.infer<typeof updateInvitationRequestSchema>;

/** One row of GET /admin/invitations (admin only, contains guest PII). Never includes a token or hash. */
export const adminInvitationRowSchema = z.object({
  id: z.string().uuid(),
  guest: adminGuestSchema,
  status: z.enum(["active", "revoked"]),
  maxPlusOnes: z.number().int().min(0),
  inviters: z.array(inviterSchema),
  rsvp: rsvpSchema.nullable(),
  createdAt: z.string().datetime({ offset: true }),
});
export type AdminInvitationRow = z.infer<typeof adminInvitationRowSchema>;

/** GET /admin/invitations: newest first. The guest list is small, so no pagination. */
export const adminInvitationsResponseSchema = z.object({ items: z.array(adminInvitationRowSchema) });
export type AdminInvitationsResponse = z.infer<typeof adminInvitationsResponseSchema>;

/** PATCH /admin/invitations/{id}: 200 response, the updated row. 404 for an unknown id. */
export const updateInvitationResponseSchema = adminInvitationRowSchema;
export type UpdateInvitationResponse = z.infer<typeof updateInvitationResponseSchema>;
