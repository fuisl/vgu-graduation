import { z } from "zod";
import { timestampSchema } from "./common.js";

/**
 * A graduate: an inviter on invitations. Added by admins one at a time (#32, #42); graduates never sign in.
 * `joinUrl` is their guest self-registration link (ADR-015), null until one is first issued.
 * `givenName`/`familyName` follow the guest rules (#170): always sent by the API,
 * optional here only so older clients and fixtures still parse.
 */
export const graduateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  givenName: z.string().min(1).optional(),
  familyName: z.string().nullable().optional(),
  /** False while the given/family split is the API's guess. */
  nameReviewed: z.boolean().optional(),
  email: z.string().email(),
  joinUrl: z.string().url().nullable().optional(),
  createdAt: timestampSchema,
});
export type Graduate = z.infer<typeof graduateSchema>;

const personNameSchema = z.string().trim().min(1).max(120);

/**
 * POST /admin/graduates. A duplicate email returns 409. Without `givenName`
 * the API splits `name` with `splitPersonName`, unreviewed.
 */
export const createGraduateRequestSchema = z.object({
  name: personNameSchema,
  givenName: personNameSchema.optional(),
  familyName: personNameSchema.nullable().optional(),
  email: z.string().trim().toLowerCase().email(),
});
export type CreateGraduateRequest = z.infer<typeof createGraduateRequestSchema>;

/**
 * PATCH /admin/graduates/{id}: every field optional, same name rules as
 * PATCH /admin/invitations/{id}. 404 unknown id, 409 duplicate email. Audited
 * as `graduate.update` with the changed field names only.
 */
export const updateGraduateRequestSchema = z
  .object({
    name: personNameSchema,
    givenName: personNameSchema,
    familyName: personNameSchema.nullable(),
    email: z.string().trim().toLowerCase().email(),
    nameReviewed: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: "Nothing to update" });
export type UpdateGraduateRequest = z.infer<typeof updateGraduateRequestSchema>;

/** GET /admin/graduates: every graduate, sorted by name. The cohort is small, so no pagination. */
export const graduatesResponseSchema = z.object({ items: z.array(graduateSchema) });
export type GraduatesResponse = z.infer<typeof graduatesResponseSchema>;
