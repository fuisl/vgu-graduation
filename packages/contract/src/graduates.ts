import { z } from "zod";
import { timestampSchema } from "./common.js";

/** A graduate: an inviter on invitations. Added by admins one at a time (#32, #42); graduates never sign in. */
export const graduateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  createdAt: timestampSchema,
});
export type Graduate = z.infer<typeof graduateSchema>;

/** POST /admin/graduates. A duplicate email returns 409. */
export const createGraduateRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
});
export type CreateGraduateRequest = z.infer<typeof createGraduateRequestSchema>;

/** GET /admin/graduates: every graduate, sorted by name. The cohort is small, so no pagination. */
export const graduatesResponseSchema = z.object({ items: z.array(graduateSchema) });
export type GraduatesResponse = z.infer<typeof graduatesResponseSchema>;
