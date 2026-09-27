import { z } from "zod";

/** Shape returned by every error response across the API. */
export const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
