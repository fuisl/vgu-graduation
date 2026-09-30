import { z } from "zod";
import { timestampSchema } from "./common.js";

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

/**
 * Admin access (#119). Anyone can sign in with GitHub, which files a pending
 * request; an owner approves it. `rejected` and `revoked` accounts stay on
 * record so a repeat sign-in does not re-open the request.
 */
export const adminAccessStatusSchema = z.enum(["pending", "approved", "rejected", "revoked"]);
export type AdminAccessStatus = z.infer<typeof adminAccessStatusSchema>;

/** A GitHub login, lowercased (logins are case-insensitive): 1–39 alphanumerics or single inner hyphens. */
export const githubHandleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/);

/** POST /admin/access (at sign-in) and GET /admin/me: the caller's own standing. */
export const adminAccessSchema = z.object({
  handle: githubHandleSchema,
  status: adminAccessStatusSchema,
  /** Owners are fixed in the API and are the only ones who can approve, reject or revoke. */
  owner: z.boolean(),
});
export type AdminAccess = z.infer<typeof adminAccessSchema>;

export const adminAccountSchema = adminAccessSchema.extend({
  requestedAt: timestampSchema,
  /** Handle of the owner who made the last decision; null while pending. */
  decidedBy: z.string().nullable(),
  decidedAt: timestampSchema.nullable(),
});
export type AdminAccount = z.infer<typeof adminAccountSchema>;

/** GET /admin/accounts (owners only): every account, newest request first. */
export const adminAccountsResponseSchema = z.object({ items: z.array(adminAccountSchema) });
export type AdminAccountsResponse = z.infer<typeof adminAccountsResponseSchema>;

/** POST /admin/accounts/:handle/{approve,reject,revoke} (owners only). */
export const adminAccountDecisionSchema = z.enum(["approve", "reject", "revoke"]);
export type AdminAccountDecision = z.infer<typeof adminAccountDecisionSchema>;
