import { z } from "zod";
import { timestampSchema } from "./common.js";

/**
 * The compact payload encoded in the pass QR code. Versioned so door scanners
 * can reject formats they don't understand. Deliberately holds no email, phone
 * or token: the QR is shown on screen and may be photographed.
 */
export const passPayloadSchema = z.object({
  v: z.literal(1),
  invitationId: z.string().uuid(),
  guestName: z.string().min(1),
  validFrom: timestampSchema.nullable(),
  validUntil: timestampSchema.nullable(),
});
export type PassPayload = z.infer<typeof passPayloadSchema>;

/**
 * GET /pass: the payload plus its signature, verified offline with the
 * published key identified by `keyId`. The signature scheme is settled in #35.
 */
export const passResponseSchema = z.object({
  payload: passPayloadSchema,
  signature: z.string().min(1),
  keyId: z.string().min(1),
});
export type PassResponse = z.infer<typeof passResponseSchema>;
