import { audit } from "../db/schema.js";
import type { db as Db } from "../db/index.js";

/** Anything with Drizzle's `insert`, so audit rows can join the caller's transaction. */
type Executor = Pick<typeof Db, "insert">;

export interface AuditEntry {
  /** GitHub handle for admins (`request.adminHandle`), `service:<name>` for service tokens. */
  actor: string;
  /** Dotted verb, e.g. `invitation.revoke`, `graduate.create`, `event.update`. */
  action: string;
  targetType?: string;
  targetId?: string;
  /** Ids and counts only: never tokens, token hashes or guest PII (AGENTS.md). */
  metadata?: Record<string, unknown>;
}

/** Appends one row to the `audit` table. Every admin write records one (#32, #33, #34, #42). */
export async function recordAudit(executor: Executor, entry: AuditEntry): Promise<void> {
  await executor.insert(audit).values({
    actor: entry.actor,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
  });
}
