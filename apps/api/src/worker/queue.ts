import type pg from "pg";

/** A claimed row of the `jobs` table, as the worker sees it. */
export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  /** Includes the current run: 1 on the first try. */
  attempts: number;
  maxAttempts: number;
}

export interface EnqueueOptions {
  /** Earliest time the job may run; defaults to now. */
  runAt?: Date;
  maxAttempts?: number;
}

/** A `running` job whose lock is older than this is presumed orphaned by a dead worker and re-claimed. */
export const DEFAULT_LEASE_MS = 10 * 60_000;

/** `last_error` is for operators, not a log sink: keep it short. */
const MAX_ERROR_LENGTH = 1000;

/** Exponential backoff after a failed attempt: 10s, 20s, 40s, ... capped at 10 minutes. */
export function retryDelayMs(attempts: number): number {
  return Math.min(10_000 * 2 ** Math.max(attempts - 1, 0), 10 * 60_000);
}

function toJob(row: {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}): Job {
  return {
    id: row.id,
    type: row.type,
    payload: row.payload,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
  };
}

/**
 * The Postgres-backed work queue (docs/architecture/target/applications-and-repository.md §4.3).
 * Claims use `FOR UPDATE SKIP LOCKED`, so concurrent workers never take the same job.
 * Payloads carry ids, never tokens or guest PII.
 */
export class JobQueue {
  constructor(
    private readonly pool: pg.Pool,
    private readonly leaseMs: number = DEFAULT_LEASE_MS,
  ) {}

  async enqueue(
    type: string,
    payload: Record<string, unknown> = {},
    options: EnqueueOptions = {},
  ): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO jobs (type, payload, run_at, max_attempts)
       VALUES ($1, $2, COALESCE($3, now()), COALESCE($4, 5))
       RETURNING id`,
      [type, JSON.stringify(payload), options.runAt ?? null, options.maxAttempts ?? null],
    );
    return rows[0]!.id;
  }

  /**
   * Atomically takes the next due job, or an orphaned one whose lease expired, and
   * counts the attempt. Returns null when nothing is due.
   */
  async claim(workerId: string): Promise<Job | null> {
    const { rows } = await this.pool.query(
      `UPDATE jobs
       SET status = 'running', attempts = attempts + 1, locked_at = now(), locked_by = $1, updated_at = now()
       WHERE id = (
         SELECT id FROM jobs
         WHERE (status = 'queued' AND run_at <= now())
            OR (status = 'running' AND locked_at < now() - make_interval(secs => $2::double precision / 1000))
         ORDER BY run_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING id, type, payload, attempts, max_attempts`,
      [workerId, this.leaseMs],
    );
    return rows[0] ? toJob(rows[0]) : null;
  }

  /** Marks a job done. Guarded by `locked_by`, so a worker that lost its lease can't overwrite the new owner. */
  async complete(job: Job, workerId: string): Promise<void> {
    await this.pool.query(
      `UPDATE jobs
       SET status = 'succeeded', locked_at = NULL, locked_by = NULL, last_error = NULL, updated_at = now()
       WHERE id = $1 AND status = 'running' AND locked_by = $2`,
      [job.id, workerId],
    );
  }

  /**
   * Records a failed attempt: re-queues with backoff while attempts remain, otherwise
   * leaves the job `failed` with its last error for an operator to inspect.
   */
  async fail(job: Job, workerId: string, error: unknown): Promise<void> {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, MAX_ERROR_LENGTH);
    const exhausted = job.attempts >= job.maxAttempts;
    await this.pool.query(
      `UPDATE jobs
       SET status = $3::text,
           run_at = CASE WHEN $3 = 'queued' THEN now() + make_interval(secs => $4::double precision / 1000) ELSE run_at END,
           locked_at = NULL, locked_by = NULL, last_error = $5, updated_at = now()
       WHERE id = $1 AND status = 'running' AND locked_by = $2`,
      [job.id, workerId, exhausted ? "failed" : "queued", retryDelayMs(job.attempts), message],
    );
  }
}
