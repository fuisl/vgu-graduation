import { z } from "zod";
import {
  cacheTagSchema,
  moderationStatusSchema,
  pageQuerySchema,
  pageSchema,
  queryBooleanSchema,
  timestampSchema,
} from "./common.js";

/**
 * Photos are addressed everywhere by `publicId`, a random unguessable
 * identifier, never by internal row ids or sequential numbers.
 */
export const mediaVariantSchema = z.enum(["thumb", "display"]);
export type MediaVariant = z.infer<typeof mediaVariantSchema>;

/**
 * Path params of GET /media/{id}/{variant}; `id` is the `publicId`. No credential.
 * Only visible, processed photos are served, as `image/jpeg` with an immutable
 * one-year Cache-Control; anything else is 404. Originals are never served.
 */
export const mediaVariantParamsSchema = z.object({
  id: z.string().min(1),
  variant: mediaVariantSchema,
});
export type MediaVariantParams = z.infer<typeof mediaVariantParamsSchema>;

/** Largest accepted upload, enforced by the API while streaming (not by the proxy). */
export const MEDIA_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Each invitation gets a roll of 36 shots, like film (decided 2026-09-29, #58).
 * Every upload spends one; hiding or removing a photo does not give it back.
 */
export const MEDIA_SHOTS_PER_INVITATION = 36;

/** Image formats POST /media accepts, sniffed from the file's bytes (the client's content type is ignored). */
export const uploadContentTypeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);
export type UploadContentType = z.infer<typeof uploadContentTypeSchema>;

/**
 * POST /media: 201 response. The request is `multipart/form-data` with one file
 * part (JPEG, PNG or WebP, up to 25 MB) and has no JSON schema. Errors: 401/404/410
 * like every invitation endpoint, 400 no file or an empty one, 409 the roll is used
 * up, 413 too large, 415 not a supported image, 503 storage unavailable (retry later).
 */
export const uploadMediaResponseSchema = z.object({
  publicId: z.string().min(1),
  processingStatus: z.enum(["pending", "ready", "failed"]),
  /** Shots left on this invitation's roll after this upload. */
  shotsRemaining: z.number().int().min(0),
});
export type UploadMediaResponse = z.infer<typeof uploadMediaResponseSchema>;

/** One gallery entry. Image URLs are built from `publicId` and the variant. */
export const galleryItemSchema = z.object({
  publicId: z.string().min(1),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  createdAt: timestampSchema,
});
export type GalleryItem = z.infer<typeof galleryItemSchema>;

/**
 * GET /gallery: visible, ready photos, newest first. Public, no credential
 * (decided 2026-09-30). Query is
 * `pageQuerySchema`; `nextCursor` is opaque.
 */
export const galleryResponseSchema = pageSchema(galleryItemSchema);
export type GalleryResponse = z.infer<typeof galleryResponseSchema>;

/**
 * POST /admin/media/{id}/moderate: body is `moderateRequestSchema`; response
 * echoes the new state. `revalidateTags` lists the web cache tags to revalidate
 * (`CACHE_TAGS.gallery` and `CACHE_TAGS.publicGallery`); empty when nothing changed.
 */
export const moderateMediaResponseSchema = z.object({
  publicId: z.string().min(1),
  status: moderationStatusSchema,
  isPublic: z.boolean(),
  revalidateTags: z.array(cacheTagSchema),
});
export type ModerateMediaResponse = z.infer<typeof moderateMediaResponseSchema>;

/**
 * GET /gallery/public (#75): the curated public gallery. Only photos that are
 * `visible`, `ready` and flagged public by a moderator, newest first. No
 * credential; same item shape, pagination and caching as GET /gallery
 * (`Cache-Control: public, s-maxage=60`, web tag `CACHE_TAGS.publicGallery`).
 * Image URLs use the derivative endpoint; originals are never exposed.
 */
export const publicGalleryResponseSchema = galleryResponseSchema;
export type PublicGalleryResponse = z.infer<typeof publicGalleryResponseSchema>;

/**
 * POST /admin/media/{publicId}/public: body is `setPublicRequestSchema`.
 * Flagging needs a `visible`, `ready` photo (409 otherwise); un-flagging
 * always works. Hiding or removing a public photo keeps the flag but drops it
 * from the public listing until it is visible again.
 * Audited as `photo.public` when the flag changes.
 */
export const setMediaPublicResponseSchema = z.object({
  publicId: z.string().min(1),
  status: moderationStatusSchema,
  isPublic: z.boolean(),
  revalidateTags: z.array(cacheTagSchema),
});
export type SetMediaPublicResponse = z.infer<typeof setMediaPublicResponseSchema>;

export const processingStatusSchema = z.enum(["pending", "ready", "failed"]);
export type ProcessingStatus = z.infer<typeof processingStatusSchema>;

/**
 * GET /admin/media: the moderation queue (#64). Every photo in any state,
 * newest first, filterable. There is no approval step (owner decision
 * 2026-09-30): `processing=pending` lists uploads still being processed.
 */
export const adminMediaQuerySchema = pageQuerySchema.extend({
  status: moderationStatusSchema.optional(),
  processing: processingStatusSchema.optional(),
  isPublic: queryBooleanSchema.optional(),
});
export type AdminMediaQuery = z.infer<typeof adminMediaQuerySchema>;

/**
 * One photo as moderators see it. Thumbnails of hidden or removed photos are
 * only reachable through GET /admin/media/{publicId}/{variant} (admin session).
 */
export const adminMediaItemSchema = galleryItemSchema.extend({
  status: moderationStatusSchema,
  processingStatus: processingStatusSchema,
  isPublic: z.boolean(),
  /** The uploader's invitation, for takedown requests. */
  invitationId: z.string().uuid(),
  updatedAt: timestampSchema,
});
export type AdminMediaItem = z.infer<typeof adminMediaItemSchema>;

export const adminMediaResponseSchema = pageSchema(adminMediaItemSchema);
export type AdminMediaResponse = z.infer<typeof adminMediaResponseSchema>;
