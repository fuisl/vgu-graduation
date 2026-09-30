import { z } from "zod";
import { moderationStatusSchema, pageSchema, timestampSchema } from "./common.js";

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

/** POST /admin/wishes/{id}/moderate: body is `moderateRequestSchema`; response echoes the new state. */
export const moderateWishResponseSchema = z.object({
  id: z.string().uuid(),
  status: moderationStatusSchema,
});
export type ModerateWishResponse = z.infer<typeof moderateWishResponseSchema>;

/** One wish as admins see it: any moderation state. */
export const adminWishSchema = wishSchema.extend({ status: moderationStatusSchema });
export type AdminWish = z.infer<typeof adminWishSchema>;

/** GET /admin/wishes: every wish in any state, newest first, so hidden ones can be restored. Query is `pageQuerySchema`. */
export const adminWishesResponseSchema = pageSchema(adminWishSchema);
export type AdminWishesResponse = z.infer<typeof adminWishesResponseSchema>;
