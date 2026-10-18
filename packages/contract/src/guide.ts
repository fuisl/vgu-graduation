import { z } from "zod";
import { timestampSchema } from "./common.js";

/**
 * Guest guide-book (#140): places and things to do around the campus while the
 * graduates are busy. Admins keep one catalogue; per invitation they may pick a
 * subset, and an invitation with no (active) picks gets every active item.
 */
export const guideCategorySchema = z.enum(["photo-spot", "food-drink", "explore", "relax", "practical"]);
export type GuideCategory = z.infer<typeof guideCategorySchema>;

export const GUIDE_TITLE_MAX_LENGTH = 120;
export const GUIDE_DESCRIPTION_MAX_LENGTH = 500;
export const GUIDE_TIME_HINT_MAX_LENGTH = 80;

/** One guide entry as guests see it. */
export const guideItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(GUIDE_TITLE_MAX_LENGTH),
  category: guideCategorySchema,
  description: z.string().max(GUIDE_DESCRIPTION_MAX_LENGTH),
  /** A map link (https), or null. */
  mapUrl: z.string().url().nullable(),
  /** Short free text such as "10 min" or "Best in the morning", or null. */
  timeHint: z.string().max(GUIDE_TIME_HINT_MAX_LENGTH).nullable(),
  sortOrder: z.number().int(),
});
export type GuideItem = z.infer<typeof guideItemSchema>;

/**
 * GET /invitations/me/guide (invitation credential): the guest's guide, in
 * `sortOrder`. `tailored` is true when the inviting graduates picked items
 * for this invitation, false when it shows the defaults. Errors like
 * GET /invitations/me (401/404/410). `Cache-Control: private, max-age=300`.
 */
export const guestGuideResponseSchema = z.object({
  tailored: z.boolean(),
  items: z.array(guideItemSchema),
});
export type GuestGuideResponse = z.infer<typeof guestGuideResponseSchema>;

/** A catalogue entry as admins see it, including inactive ones. */
export const adminGuideItemSchema = guideItemSchema.extend({
  active: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type AdminGuideItem = z.infer<typeof adminGuideItemSchema>;

/** GET /admin/guide/items: the whole catalogue in `sortOrder`. */
export const adminGuideItemsResponseSchema = z.object({ items: z.array(adminGuideItemSchema) });
export type AdminGuideItemsResponse = z.infer<typeof adminGuideItemsResponseSchema>;

const httpsUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((url) => url.startsWith("https://"), { message: "Map links must use https" });

/** POST /admin/guide/items: 201 with the item. Audited as `guide.item.create`. */
export const createGuideItemRequestSchema = z.object({
  title: z.string().trim().min(1).max(GUIDE_TITLE_MAX_LENGTH),
  category: guideCategorySchema,
  description: z.string().trim().max(GUIDE_DESCRIPTION_MAX_LENGTH).default(""),
  mapUrl: httpsUrlSchema.nullable().default(null),
  timeHint: z.string().trim().min(1).max(GUIDE_TIME_HINT_MAX_LENGTH).nullable().default(null),
  sortOrder: z.number().int().min(-10000).max(10000).default(0),
  active: z.boolean().default(true),
});
export type CreateGuideItemRequest = z.infer<typeof createGuideItemRequestSchema>;

/**
 * PATCH /admin/guide/items/{id}: any subset of the create fields; `null`
 * clears `mapUrl` or `timeHint`. 404 unknown id. Audited as `guide.item.update`.
 * Deactivating (`active: false`) hides an item everywhere but keeps it, and
 * every per-invitation pick of it, for later.
 */
export const updateGuideItemRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(GUIDE_TITLE_MAX_LENGTH),
    category: guideCategorySchema,
    description: z.string().trim().max(GUIDE_DESCRIPTION_MAX_LENGTH),
    mapUrl: httpsUrlSchema.nullable(),
    timeHint: z.string().trim().min(1).max(GUIDE_TIME_HINT_MAX_LENGTH).nullable(),
    sortOrder: z.number().int().min(-10000).max(10000),
    active: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: "Nothing to update" });
export type UpdateGuideItemRequest = z.infer<typeof updateGuideItemRequestSchema>;

/**
 * DELETE /admin/guide/items/{id}: 204. Removes the item and every pick of it.
 * Audited as `guide.item.delete`. Prefer `active: false` to keep it for later.
 */

/**
 * PUT /admin/invitations/{id}/guide: replaces the invitation's picks. An empty
 * list goes back to the defaults. Unknown item ids are 400; unknown invitation
 * 404. Audited as `invitation.guide.set` with the count only.
 */
export const putInvitationGuideRequestSchema = z.object({
  itemIds: z.array(z.string().uuid()).max(100),
});
export type PutInvitationGuideRequest = z.infer<typeof putInvitationGuideRequestSchema>;

/**
 * GET and PUT /admin/invitations/{id}/guide: the picks (`selectedItemIds`, may
 * include inactive items) and what the guest sees right now (`effective`, same
 * as GET /invitations/me/guide).
 */
export const adminInvitationGuideResponseSchema = z.object({
  invitationId: z.string().uuid(),
  selectedItemIds: z.array(z.string().uuid()),
  effective: guestGuideResponseSchema,
});
export type AdminInvitationGuideResponse = z.infer<typeof adminInvitationGuideResponseSchema>;
