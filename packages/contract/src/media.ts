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

/** POST /media: 201 response. The request is `multipart/form-data` (one image, up to 25 MB) and has no JSON schema. */
export const uploadMediaResponseSchema = z.object({
  publicId: z.string().min(1),
  processingStatus: z.enum(["pending", "ready", "failed"]),
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
