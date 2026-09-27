import { z } from "zod";

export const guestSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
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

/** POST /admin/invitations — request body */
export const createInvitationRequestSchema = z.object({
  guestName: z.string().min(1),
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
