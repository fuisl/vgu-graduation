import { z } from "zod";
import {
  cacheTagSchema,
  moderationStatusSchema,
  pageQuerySchema,
  pageSchema,
  queryBooleanSchema,
  timestampSchema,
} from "./common.js";

/** Matches the database CHECK on `wishes.body`. */
export const WISH_MAX_LENGTH = 1000;

/** POST /wishes. `authorName` defaults to the guest's name when omitted. */
export const createWishRequestSchema = z.object({
  body: z.string().trim().min(1).max(WISH_MAX_LENGTH),
  authorName: z.string().trim().min(1).max(80).optional(),
});
export type CreateWishRequest = z.infer<typeof createWishRequestSchema>;

export const wishSchema = z.object({
  id: z.string().uuid(),
  authorName: z.string(),
  body: z.string(),
  createdAt: timestampSchema,
});
export type Wish = z.infer<typeof wishSchema>;

/** POST /wishes: 201 response. */
export const createWishResponseSchema = wishSchema;
export type CreateWishResponse = z.infer<typeof createWishResponseSchema>;

/** GET /wishes: visible wishes, newest first. Query is `pageQuerySchema`. */
export const wishesResponseSchema = pageSchema(wishSchema);
export type WishesResponse = z.infer<typeof wishesResponseSchema>;

/**
 * POST /admin/wishes/{id}/moderate: body is `moderateRequestSchema`; response
 * echoes the new state. `revalidateTags` lists the web cache tags to revalidate
 * (`CACHE_TAGS.wishes` and `CACHE_TAGS.publicWishes`); empty when nothing changed.
 */
export const moderateWishResponseSchema = z.object({
  id: z.string().uuid(),
  status: moderationStatusSchema,
  isPublic: z.boolean(),
  revalidateTags: z.array(cacheTagSchema),
});
export type ModerateWishResponse = z.infer<typeof moderateWishResponseSchema>;

/** One wish as admins see it: any moderation state, and whether it is in the curated public set. */
export const adminWishSchema = wishSchema.extend({
  status: moderationStatusSchema,
  isPublic: z.boolean(),
});
export type AdminWish = z.infer<typeof adminWishSchema>;

/** GET /admin/wishes query: `pageQuerySchema` plus optional filters (#64). */
export const adminWishesQuerySchema = pageQuerySchema.extend({
  status: moderationStatusSchema.optional(),
  isPublic: queryBooleanSchema.optional(),
});
export type AdminWishesQuery = z.infer<typeof adminWishesQuerySchema>;

/** GET /admin/wishes: every wish in any state, newest first, so hidden ones can be restored. Query is `adminWishesQuerySchema`. */
export const adminWishesResponseSchema = pageSchema(adminWishSchema);
export type AdminWishesResponse = z.infer<typeof adminWishesResponseSchema>;

/**
 * GET /wishes/public (#75): the curated public wishes. Only wishes that are
 * `visible` and flagged public, newest first. No credential; same shape,
 * pagination and caching as GET /wishes (web tag `CACHE_TAGS.publicWishes`).
 */
export const publicWishesResponseSchema = wishesResponseSchema;
export type PublicWishesResponse = z.infer<typeof publicWishesResponseSchema>;

/**
 * POST /admin/wishes/{id}/public: body is `setPublicRequestSchema`. Flagging
 * needs a `visible` wish (409 otherwise); un-flagging always works. Audited as
 * `wish.public` when the flag changes.
 */
export const setWishPublicResponseSchema = z.object({
  id: z.string().uuid(),
  status: moderationStatusSchema,
  isPublic: z.boolean(),
  revalidateTags: z.array(cacheTagSchema),
});
export type SetWishPublicResponse = z.infer<typeof setWishPublicResponseSchema>;
