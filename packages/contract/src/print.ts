import { z } from "zod";
import { timestampSchema } from "./common.js";

export const printJobStatusSchema = z.enum(["queued", "printing", "done", "failed"]);
export type PrintJobStatus = z.infer<typeof printJobStatusSchema>;

/** POST /print/jobs: requests a print of a visible photo, identified by its `publicId`. */
export const createPrintJobRequestSchema = z.object({
  photoPublicId: z.string().min(1),
  copies: z.number().int().min(1).max(5).default(1),
});
export type CreatePrintJobRequest = z.infer<typeof createPrintJobRequestSchema>;

export const printJobSchema = z.object({
  id: z.string().uuid(),
  photoPublicId: z.string().min(1),
  copies: z.number().int().min(1),
  status: printJobStatusSchema,
  createdAt: timestampSchema,
});
export type PrintJob = z.infer<typeof printJobSchema>;

/** POST /print/jobs: 201 response. */
export const createPrintJobResponseSchema = printJobSchema;
export type CreatePrintJobResponse = z.infer<typeof createPrintJobResponseSchema>;

/** GET /internal/print/jobs/next (service token `printer`): the oldest queued job, marked `printing`, or null. */
export const nextPrintJobResponseSchema = z.object({ job: printJobSchema.nullable() });
export type NextPrintJobResponse = z.infer<typeof nextPrintJobResponseSchema>;

/** POST /internal/print/jobs/{id}/done (service token `printer`). */
export const completePrintJobRequestSchema = z.object({
  result: z.enum(["done", "failed"]),
  error: z.string().max(500).optional(),
});
export type CompletePrintJobRequest = z.infer<typeof completePrintJobRequestSchema>;
