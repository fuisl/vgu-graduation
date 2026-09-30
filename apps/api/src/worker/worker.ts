import type { Job, JobQueue } from "./queue.js";

/**
 * Runs one job. Throwing fails the attempt; the queue retries it with backoff until
 * `maxAttempts`. Handlers must be idempotent: a job whose worker dies mid-run is
 * re-claimed after its lease expires and runs again.
 */
export type JobHandler = (job: Job) => Promise<void>;

/**
 * Handlers by job type. Modules register theirs here as they land: derivative
 * generation (#59), moderation notifications, print dispatch (#72).
 */
export type JobHandlers = Record<string, JobHandler>;

export interface WorkerLogger {
  info(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

export interface WorkerOptions {
  queue: Pick<JobQueue, "claim" | "complete" | "fail">;
  handlers: JobHandlers;
  workerId: string;
  logger: WorkerLogger;
  /** Aborting stops claiming new jobs; the job in progress finishes first. */
  signal: AbortSignal;
  /** Idle wait between polls when the queue is empty. */
  pollIntervalMs?: number;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

/**
 * Claims and runs one job if one is due. Returns false when the queue is empty.
 * Logs job ids and types only, never payloads.
 */
export async function runOnce(options: Omit<WorkerOptions, "signal" | "pollIntervalMs">): Promise<boolean> {
  const { queue, handlers, workerId, logger } = options;
  const job = await queue.claim(workerId);
  if (!job) return false;

  const fields = { jobId: job.id, type: job.type, attempt: job.attempts, maxAttempts: job.maxAttempts };
  const handler = handlers[job.type];
  try {
    // An unknown type is retried like any failure: during a rolling deploy, a newer
    // worker that knows it may pick it up.
    if (!handler) throw new Error(`no handler registered for job type "${job.type}"`);
    await handler(job);
    await queue.complete(job, workerId);
    logger.info(fields, "job succeeded");
  } catch (err) {
    await queue.fail(job, workerId, err);
    const final = job.attempts >= job.maxAttempts;
    logger.error(
      { ...fields, error: err instanceof Error ? err.message : String(err) },
      final ? "job failed permanently" : "job failed, will retry",
    );
  }
  return true;
}

/** Polls until `signal` aborts. One job at a time per process; scale with replicas. */
export async function runWorker(options: WorkerOptions): Promise<void> {
  const { signal, pollIntervalMs = 1000, logger } = options;
  while (!signal.aborted) {
    let worked = false;
    try {
      worked = await runOnce(options);
    } catch (err) {
      // Claim or bookkeeping failed (e.g. Postgres briefly unreachable): back off and keep polling.
      logger.error({ error: err instanceof Error ? err.message : String(err) }, "worker poll failed");
    }
    if (!worked) await sleep(pollIntervalMs, signal);
  }
}
