import { z } from "zod";
import { moderationStatusSchema, pageSchema, timestampSchema } from "./common.js";

/**
 * Photos are addressed everywhere by `publicId`, a random unguessable
 * identifier, never by internal row ids or sequential numbers.
 */
export const mediaVariantSchema = z.enum(["thumb", "display"]);
export type MediaVariant = z.infer<typeof mediaVariantSchema>;

/** Path params of GET /media/{id}/{variant}. Only visible, processed photos are served. */
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

/** GET /gallery: visible, ready photos, newest first. Query is `pageQuerySchema`. */
export const galleryResponseSchema = pageSchema(galleryItemSchema);
export type GalleryResponse = z.infer<typeof galleryResponseSchema>;

/** POST /admin/media/{id}/moderate: body is `moderateRequestSchema`; response echoes the new state. */
export const moderateMediaResponseSchema = z.object({
  publicId: z.string().min(1),
  status: moderationStatusSchema,
});
export type ModerateMediaResponse = z.infer<typeof moderateMediaResponseSchema>;
