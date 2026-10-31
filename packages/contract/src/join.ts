import { z } from "zod";
import { mailLocaleSchema } from "./mail.js";

/*
 * Guest self-registration (ADR-015). Each graduate has one join link,
 * `/join/{code}`, which they share with their own guests. A guest who opens it
 * types a name and email and gets a personal invitation by email at once, with
 * that graduate as the inviter. The code only lets someone register as this
 * graduate's guest: it reads nothing back, so it is not a bearer credential like
 * the invitation token.
 */

/** A join code: 64-bit random, base64url (11 characters). Anything else is rejected before a lookup. */
export const joinCodeSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

/**
 * POST /join-links/request: a graduate asks for their join link by email. The
 * answer is the same 202 whether or not the address belongs to a graduate, so it
 * can't be used to find out who is one; the link only ever goes to the
 * graduate's stored address. 503 while mail is off.
 */
export const joinLinkRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  locale: mailLocaleSchema.default("en"),
});
export type JoinLinkRequest = z.infer<typeof joinLinkRequestSchema>;

/** POST /join-links/request: 202 response. */
export const joinLinkResponseSchema = z.object({ status: z.literal("accepted") });
export type JoinLinkResponse = z.infer<typeof joinLinkResponseSchema>;

/** GET /join/{code}: who the guest would be registering with. The graduate's name only. 404 for an unknown code. */
export const joinInfoSchema = z.object({
  graduate: z.object({ name: z.string().min(1), givenName: z.string().min(1) }),
});
export type JoinInfo = z.infer<typeof joinInfoSchema>;

/**
 * POST /join/{code}: a guest registers. `website` is a honeypot the form hides
 * from people; a filled one is accepted with the normal answer and dropped.
 */
export const joinRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  website: z.string().max(200).optional(),
});
export type JoinRequest = z.infer<typeof joinRequestSchema>;

/**
 * POST /join/{code}: 201 response. The same answer whether a new invitation was
 * emailed or the address already had one (then this graduate is added as a
 * co-inviter and nothing is sent), so the form can't be used to check who is
 * invited. 404 unknown code, 429 over the limit, 503 mail off, 502 the email
 * could not be sent (nothing is kept, so the guest can simply try again).
 */
export const joinResponseSchema = z.object({ status: z.literal("registered") });
export type JoinResponse = z.infer<typeof joinResponseSchema>;

/** POST /admin/graduates/{id}/join-link: 200 response, a new join link (the old one stops working). */
export const rotateJoinLinkResponseSchema = z.object({ joinUrl: z.string().url() });
export type RotateJoinLinkResponse = z.infer<typeof rotateJoinLinkResponseSchema>;

/** Join link requests one email address may make in `JOIN_LINK_REQUEST_WINDOW_MS`. */
export const JOIN_LINK_REQUEST_LIMIT = 3;
export const JOIN_LINK_REQUEST_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Registrations one join link accepts in `JOIN_WINDOW_MS`. A brake on scripted abuse, not a guest cap. */
export const JOIN_LIMIT = 60;
export const JOIN_WINDOW_MS = 60 * 60 * 1000;
