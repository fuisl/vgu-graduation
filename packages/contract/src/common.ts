import { z } from "zod";

/** Shape returned by every error response across the API. */
export const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** ISO 8601 timestamp with offset, e.g. what `Date.prototype.toISOString()` returns. */
export const timestampSchema = z.string().datetime({ offset: true });

/** Moderation state shared by photos and wishes: shown by default, hidden reversibly, or removed on takedown. */
export const moderationStatusSchema = z.enum(["visible", "hidden", "removed"]);
export type ModerationStatus = z.infer<typeof moderationStatusSchema>;

/** Body of the admin moderate endpoints (media and wishes). */
export const moderateRequestSchema = z.object({ status: moderationStatusSchema });
export type ModerateRequest = z.infer<typeof moderateRequestSchema>;

/** Cursor pagination for listings: newest first, `cursor` is opaque and comes from `nextCursor`. */
export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}
