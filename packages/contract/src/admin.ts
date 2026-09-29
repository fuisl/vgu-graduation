import { z } from "zod";

const count = z.number().int().min(0);

/** GET /admin/overview: aggregate counts only, no guest PII. */
export const adminOverviewSchema = z.object({
  invitations: z.object({ total: count, active: count, revoked: count }),
  rsvp: z.object({ attending: count, declined: count, pending: count, plusOnes: count }),
  photos: z.object({ visible: count, hidden: count, removed: count, pending: count }),
  wishes: z.object({ visible: count, hidden: count, removed: count }),
  jobs: z.object({ queued: count, failed: count }),
});
export type AdminOverview = z.infer<typeof adminOverviewSchema>;
