import { z } from "zod";
import { timestampSchema } from "./common.js";

/*
 * Graduate portal (ADR-017): a graduate signs in by email and sees who their guests are. The
 * credential is a session token of its own, sent only as `Authorization: Bearer` by the web BFF.
 * A join code or an invitation token never opens these routes, and a session token opens nothing else.
 */

/** A sign-in link works for this long. */
export const GRADUATE_SIGN_IN_TTL_MS = 30 * 60 * 1000;
/** A portal session lasts this long. It doesn't slide: signing in again starts a new one. */
export const GRADUATE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** A sign-in or session token: 128-bit random, base64url. Anything else is rejected before a lookup. */
export const graduateTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);

/** POST /graduate/sessions: spends a sign-in token. 401 if it is unknown, used or expired. */
export const graduateSignInRequestSchema = z.object({ token: graduateTokenSchema });
export type GraduateSignInRequest = z.infer<typeof graduateSignInRequestSchema>;

/** POST /graduate/sessions: 201 response. The web BFF puts the token in an HttpOnly cookie. */
export const graduateSessionResponseSchema = z.object({ token: graduateTokenSchema, expiresAt: timestampSchema });
export type GraduateSessionResponse = z.infer<typeof graduateSessionResponseSchema>;

/** GET /graduate/me: who is signed in and their join link, issued on first read and never replaced here. */
export const graduateMeResponseSchema = z.object({
  graduate: z.object({ name: z.string().min(1), givenName: z.string().min(1) }),
  joinUrl: z.string().url(),
});
export type GraduateMeResponse = z.infer<typeof graduateMeResponseSchema>;

/** A guest's answer as the graduate sees it. */
export const graduateGuestStatusSchema = z.enum(["attending", "declined", "pending"]);
export type GraduateGuestStatus = z.infer<typeof graduateGuestStatusSchema>;

/**
 * One guest on a graduate's list. Strict, and only what the dashboard shows: no accessibility needs,
 * tokens, photos, wishes or other inviters. `soleInviter` says only whether anyone else also invited
 * this guest, because removing them means something different in each case (ADR-017).
 */
export const graduateGuestSchema = z
  .object({
    /** The invitation id. */
    id: z.string().uuid(),
    name: z.string().min(1),
    email: z.string().nullable(),
    status: graduateGuestStatusSchema,
    /** When they last answered; null until they have. */
    answeredAt: timestampSchema.nullable(),
    soleInviter: z.boolean(),
  })
  .strict();
export type GraduateGuest = z.infer<typeof graduateGuestSchema>;

/** GET /graduate/guests: this graduate's guests with an active invitation, newest first. */
export const graduateGuestsResponseSchema = z.object({ items: z.array(graduateGuestSchema) });
export type GraduateGuestsResponse = z.infer<typeof graduateGuestsResponseSchema>;

/** POST /graduate/guests: the same fields as a join-link registration, without the code. */
export const graduateInviteRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
});
export type GraduateInviteRequest = z.infer<typeof graduateInviteRequestSchema>;

/**
 * POST /graduate/guests: 201 response. `invited`: a new invitation was emailed. `already_invited`:
 * the address already had one, this graduate is now a co-inviter, and no email was sent. 429 over
 * the limit, 503 mail off, 502 the email could not be sent (nothing is kept).
 */
export const graduateInviteResponseSchema = z.object({ status: z.enum(["invited", "already_invited"]) });
export type GraduateInviteResponse = z.infer<typeof graduateInviteResponseSchema>;

/**
 * DELETE /graduate/guests/{id}: 200 response. `revoked`: this graduate was the only inviter, so the
 * invitation was revoked and its link stopped working. `unlinked`: someone else also invited the
 * guest, so only this graduate left and the invitation is untouched. 404 unless the guest is on this
 * graduate's list.
 */
export const graduateRemoveGuestResponseSchema = z.object({ outcome: z.enum(["revoked", "unlinked"]) });
export type GraduateRemoveGuestResponse = z.infer<typeof graduateRemoveGuestResponseSchema>;

/** Invitations one graduate may send per hour, so a mistake or a stolen session can't spam. */
export const GRADUATE_INVITE_LIMIT = 20;
export const GRADUATE_INVITE_WINDOW_MS = 60 * 60 * 1000;
/** Invitation emails the whole portal may send per day: well under Gmail's 500, leaving room for other mail. */
export const GRADUATE_INVITE_DAILY_LIMIT = 300;
export const GRADUATE_INVITE_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Removals one graduate may make per hour. */
export const GRADUATE_REMOVE_LIMIT = 60;
export const GRADUATE_REMOVE_WINDOW_MS = 60 * 60 * 1000;
