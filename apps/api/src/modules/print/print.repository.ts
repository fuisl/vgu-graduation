import type { AdminPrintJobsQuery, PrintJobStatus } from "@grad/contract";
import { and, count, desc, eq, gte, type SQL, sql } from "drizzle-orm";
import { recordAudit } from "../../audit/audit.js";
import { db, pool } from "../../db/index.js";
import { invitations, photos, printJobs } from "../../db/schema.js";

export interface StoredPrintJob {
  id: string;
  photoPublicId: string;
  copies: number;
  status: PrintJobStatus;
  requestedByAdmin: string | null;
  attempts: number;
  error: string | null;
  leaseExpiresAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewPrintJob {
  photoId: string;
  copies: number;
  /** Exactly one of these: the admin handle, or the guest's invitation. */
  requestedByAdmin?: string;
  requestedByInvitationId?: string;
}

export type CreatePrintJobResult = { status: "ok"; job: StoredPrintJob } | { status: "rate_limited" };

export type CompletePrintJobResult =
  | { status: "ok"; job: StoredPrintJob; changed: boolean }
  | { status: "conflict"; job: StoredPrintJob }
  | { status: "not_found" };

export type RetryPrintJobResult =
  | { status: "ok"; job: StoredPrintJob }
  | { status: "conflict"; job: StoredPrintJob }
  | { status: "not_found" };

export interface ClaimedJob extends StoredPrintJob {
  leaseExpiresAt: Date;
}

/** Shown to admins when the queue gives up on a job; never guest data. */
export const LEASE_EXHAUSTED_ERROR = "The printer did not confirm this job";
export const PHOTO_UNAVAILABLE_ERROR = "The photo is no longer available";
const MAX_ERROR_LENGTH = 500;

const columns = {
  id: printJobs.id,
  photoPublicId: photos.publicId,
  copies: printJobs.copies,
  status: printJobs.status,
  requestedByAdmin: printJobs.requestedByAdmin,
  attempts: printJobs.attempts,
  error: printJobs.error,
  leaseExpiresAt: printJobs.leaseExpiresAt,
  completedAt: printJobs.completedAt,
  createdAt: printJobs.createdAt,
  updatedAt: printJobs.updatedAt,
};

type Executor = Pick<typeof db, "select">;

async function findJob(executor: Executor, id: string): Promise<StoredPrintJob | null> {
  const [row] = await executor
    .select(columns)
    .from(printJobs)
    .innerJoin(photos, eq(photos.id, printJobs.photoId))
    .where(eq(printJobs.id, id));
  return row ?? null;
}

/**
 * The durable print queue (#72). Claims use `FOR UPDATE SKIP LOCKED`, so two
 * daemons never print the same job; leases bound how long a claimed job can
 * stay unreported.
 */
export class PrintRepository {
  /**
   * Leases that ran out: back to `queued`, or `failed` once a job has been
   * claimed `maxAttempts` times without a report. Runs before every claim and
   * admin listing, so no timer is needed and nothing is lost while the API or
   * the daemon is down. Rows still locked by a concurrent claim are skipped.
   */
  async expireLeases(maxAttempts: number): Promise<void> {
    await pool.query(
      `WITH expired AS (
         SELECT id FROM print_jobs
         WHERE status = 'printing' AND lease_expires_at < now()
         FOR UPDATE SKIP LOCKED
       )
       UPDATE print_jobs j
       SET status = CASE WHEN j.attempts >= $1 THEN 'failed' ELSE 'queued' END,
           error = CASE WHEN j.attempts >= $1 THEN $2 ELSE j.error END,
           completed_at = CASE WHEN j.attempts >= $1 THEN now() ELSE NULL END,
           lease_expires_at = NULL,
           updated_at = now()
       FROM expired WHERE j.id = expired.id`,
      [maxAttempts, LEASE_EXHAUSTED_ERROR],
    );
  }

  /**
   * Queues a job and audits it. A guest request takes a row lock on the
   * invitation while counting its recent jobs, so parallel requests can't
   * slip past the per-invitation limit.
   */
  async create(
    job: NewPrintJob,
    actor: string,
    guestLimit?: { max: number; since: Date },
  ): Promise<CreatePrintJobResult> {
    return db.transaction(async (tx) => {
      if (job.requestedByInvitationId && guestLimit) {
        await tx
          .select({ id: invitations.id })
          .from(invitations)
          .where(eq(invitations.id, job.requestedByInvitationId))
          .for("update");
        const [recent] = await tx
          .select({ n: count() })
          .from(printJobs)
          .where(
            and(
              eq(printJobs.requestedByInvitationId, job.requestedByInvitationId),
              gte(printJobs.createdAt, guestLimit.since),
            ),
          );
        if ((recent?.n ?? 0) >= guestLimit.max) return { status: "rate_limited" } as const;
      }

      const [inserted] = await tx
        .insert(printJobs)
        .values({
          photoId: job.photoId,
          copies: job.copies,
          requestedByAdmin: job.requestedByAdmin ?? null,
          requestedByInvitationId: job.requestedByInvitationId ?? null,
        })
        .returning({ id: printJobs.id });
      await recordAudit(tx, {
        actor,
        action: "print.create",
        targetType: "print_job",
        targetId: inserted.id,
        metadata: {
          photoId: job.photoId,
          copies: job.copies,
          requestedBy: job.requestedByAdmin ? "admin" : "guest",
          ...(job.requestedByInvitationId ? { invitationId: job.requestedByInvitationId } : {}),
        },
      });
      return { status: "ok", job: (await findJob(tx, inserted.id))! } as const;
    });
  }

  /**
   * Claims the oldest queued job, or one whose lease ran out, and marks it
   * `printing` until `now + leaseSeconds`. Jobs whose lease ran out
   * `maxAttempts` times are failed first; a job whose photo was hidden or
   * removed since it was queued is failed and skipped.
   */
  async claim(leaseSeconds: number, maxAttempts: number, actor: string): Promise<ClaimedJob | null> {
    await this.expireLeases(maxAttempts);

    // Bounded: each pass either returns a job or fails one that can't print.
    for (let pass = 0; pass < 20; pass++) {
      const { rows } = await pool.query<{ id: string }>(
        `UPDATE print_jobs j
         SET status = 'printing', attempts = j.attempts + 1,
             lease_expires_at = now() + make_interval(secs => $1::double precision),
             updated_at = now()
         WHERE j.id = (
           SELECT p.id FROM print_jobs p
           WHERE p.status = 'queued'
           ORDER BY p.created_at, p.id
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         RETURNING j.id`,
        [leaseSeconds],
      );
      const claimed = rows[0];
      if (!claimed) return null;

      const [photo] = await db
        .select({ status: photos.moderationStatus, processing: photos.processingStatus })
        .from(printJobs)
        .innerJoin(photos, eq(photos.id, printJobs.photoId))
        .where(eq(printJobs.id, claimed.id));
      if (photo?.status === "visible" && photo.processing === "ready") {
        return (await findJob(db, claimed.id)) as ClaimedJob;
      }
      await db.transaction(async (tx) => {
        await tx
          .update(printJobs)
          .set({ status: "failed", error: PHOTO_UNAVAILABLE_ERROR, leaseExpiresAt: null, completedAt: new Date(), updatedAt: new Date() })
          .where(eq(printJobs.id, claimed.id));
        await recordAudit(tx, {
          actor,
          action: "print.skip",
          targetType: "print_job",
          targetId: claimed.id,
          metadata: { reason: "photo_unavailable" },
        });
      });
    }
    return null;
  }

  /**
   * Records the daemon's report. Accepted while `printing`, or `queued` again
   * after a lease ran out (the print happened late, so it must not repeat).
   */
  async complete(
    id: string,
    result: "done" | "failed",
    error: string | undefined,
    actor: string,
  ): Promise<CompletePrintJobResult> {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select({ status: printJobs.status, attempts: printJobs.attempts })
        .from(printJobs)
        .where(eq(printJobs.id, id))
        .for("update");
      if (!current) return { status: "not_found" } as const;
      if (current.status === result) return { status: "ok", job: (await findJob(tx, id))!, changed: false } as const;
      const open = current.status === "printing" || (current.status === "queued" && current.attempts > 0);
      if (!open) return { status: "conflict", job: (await findJob(tx, id))! } as const;

      await tx
        .update(printJobs)
        .set({
          status: result,
          error: result === "failed" ? (error ?? "The printer reported a failure").slice(0, MAX_ERROR_LENGTH) : null,
          leaseExpiresAt: null,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(printJobs.id, id));
      await recordAudit(tx, {
        actor,
        action: "print.complete",
        targetType: "print_job",
        targetId: id,
        metadata: { result },
      });
      return { status: "ok", job: (await findJob(tx, id))!, changed: true } as const;
    });
  }

  /** Puts a failed job back in the queue with a fresh attempt count. Audited. */
  async retry(id: string, actor: string): Promise<RetryPrintJobResult> {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select({ status: printJobs.status })
        .from(printJobs)
        .where(eq(printJobs.id, id))
        .for("update");
      if (!current) return { status: "not_found" } as const;
      if (current.status !== "failed") return { status: "conflict", job: (await findJob(tx, id))! } as const;
      await tx
        .update(printJobs)
        .set({ status: "queued", attempts: 0, error: null, leaseExpiresAt: null, completedAt: null, updatedAt: new Date() })
        .where(eq(printJobs.id, id));
      await recordAudit(tx, { actor, action: "print.retry", targetType: "print_job", targetId: id });
      return { status: "ok", job: (await findJob(tx, id))! } as const;
    });
  }

  /** One page of jobs, newest first; `cursor` is the last job id of the previous page. */
  async list(query: AdminPrintJobsQuery): Promise<StoredPrintJob[]> {
    const filters: SQL[] = [];
    if (query.status) filters.push(eq(printJobs.status, query.status));
    if (query.cursor) {
      filters.push(
        sql`(${printJobs.createdAt}, ${printJobs.id}) < (SELECT c.created_at, c.id FROM print_jobs c WHERE c.id = ${query.cursor})`,
      );
    }
    return db
      .select(columns)
      .from(printJobs)
      .innerJoin(photos, eq(photos.id, printJobs.photoId))
      .where(and(...filters))
      .orderBy(desc(printJobs.createdAt), desc(printJobs.id))
      .limit(query.limit + 1);
  }

  /** Jobs per status across the whole queue. */
  async counts(): Promise<Record<PrintJobStatus, number>> {
    const rows = await db.select({ status: printJobs.status, n: count() }).from(printJobs).groupBy(printJobs.status);
    const counts: Record<PrintJobStatus, number> = { queued: 0, printing: 0, done: 0, failed: 0 };
    for (const row of rows) counts[row.status] = row.n;
    return counts;
  }
}
