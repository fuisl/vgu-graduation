import { z } from "zod";
import { pageQuerySchema, pageSchema, timestampSchema } from "./common.js";
import { mediaVariantSchema } from "./media.js";

/**
 * Print queue (#72, experimental). Jobs live in the `print_jobs` table, so they
 * survive API restarts and simply wait while the printer daemon is away.
 * `queued` → `printing` (claimed under a lease) → `done` or `failed`. A lease
 * that runs out without a report puts the job back to `queued`; after
 * `PRINT_MAX_ATTEMPTS` claims it is `failed` instead.
 */
export const printJobStatusSchema = z.enum(["queued", "printing", "done", "failed"]);
export type PrintJobStatus = z.infer<typeof printJobStatusSchema>;

/** How long a claimed job stays `printing` before it is re-queued if the daemon never reports. */
export const PRINT_LEASE_SECONDS = 300;
/** Claims per job before an unreported job is marked `failed`. */
export const PRINT_MAX_ATTEMPTS = 3;
/**
 * Guest requests (only when `PRINT_GUEST_REQUESTS_ENABLED=true`): this many
 * jobs per invitation per window, one copy each.
 */
export const PRINT_GUEST_RATE_LIMIT = { max: 3, windowSeconds: 60 * 60 } as const;

/**
 * POST /print/jobs: requests a print of a visible, processed photo, identified
 * by its `publicId`. Admin session (any copies), or a guest's invitation
 * credential when guest requests are enabled (one copy; 403 when disabled,
 * 429 with Retry-After over the per-invitation limit). 404 unknown photo,
 * 409 a photo that is hidden, removed or not processed yet.
 */
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

/**
 * A job handed to the printer daemon. Fetch the image from `imageUrl` (the
 * public derivative endpoint, `display` variant, a JPEG up to 2048 px; no
 * credential needed). Originals are never exposed. Report with
 * POST /internal/print/jobs/{id}/done before `leaseExpiresAt`, or the job is
 * re-queued and may print twice.
 */
export const claimedPrintJobSchema = printJobSchema.extend({
  imageUrl: z.string().url(),
  variant: mediaVariantSchema,
  /** 1 on the first claim. */
  attempt: z.number().int().min(1),
  leaseExpiresAt: timestampSchema,
});
export type ClaimedPrintJob = z.infer<typeof claimedPrintJobSchema>;

/**
 * GET /internal/print/jobs/next (service token `printer`): atomically claims the
 * oldest queued job (or one whose lease ran out), marks it `printing`, or null
 * when the queue is empty. Concurrent daemons never get the same job.
 */
export const nextPrintJobResponseSchema = z.object({ job: claimedPrintJobSchema.nullable() });
export type NextPrintJobResponse = z.infer<typeof nextPrintJobResponseSchema>;

/**
 * POST /internal/print/jobs/{id}/done (service token `printer`). Accepted while
 * the job is `printing`, or `queued` again after its lease ran out (the print
 * happened late). Repeating the same result is a no-op 200; anything else on a
 * finished job is 409; unknown id 404. Responds with the job.
 */
export const completePrintJobRequestSchema = z.object({
  result: z.enum(["done", "failed"]),
  error: z.string().max(500).optional(),
});
export type CompletePrintJobRequest = z.infer<typeof completePrintJobRequestSchema>;

export const completePrintJobResponseSchema = printJobSchema;
export type CompletePrintJobResponse = z.infer<typeof completePrintJobResponseSchema>;

/** A job as admins see it. `error` is what the daemon reported (or the lease reason), never guest data. */
export const adminPrintJobSchema = printJobSchema.extend({
  requestedBy: z.enum(["admin", "guest"]),
  attempts: z.number().int().min(0),
  error: z.string().nullable(),
  leaseExpiresAt: timestampSchema.nullable(),
  completedAt: timestampSchema.nullable(),
  updatedAt: timestampSchema,
});
export type AdminPrintJob = z.infer<typeof adminPrintJobSchema>;

/** GET /admin/print/jobs query: newest first, optional status filter. */
export const adminPrintJobsQuerySchema = pageQuerySchema.extend({
  status: printJobStatusSchema.optional(),
});
export type AdminPrintJobsQuery = z.infer<typeof adminPrintJobsQuerySchema>;

const count = z.number().int().min(0);

/** GET /admin/print/jobs: one page of jobs plus queue counts by status (all jobs, not just the page). */
export const adminPrintJobsResponseSchema = pageSchema(adminPrintJobSchema).extend({
  counts: z.object({ queued: count, printing: count, done: count, failed: count }),
});
export type AdminPrintJobsResponse = z.infer<typeof adminPrintJobsResponseSchema>;

/** POST /admin/print/jobs/{id}/retry: puts a `failed` job back in the queue (409 otherwise). Audited. */
export const retryPrintJobResponseSchema = adminPrintJobSchema;
export type RetryPrintJobResponse = z.infer<typeof retryPrintJobResponseSchema>;
