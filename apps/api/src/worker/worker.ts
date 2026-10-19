import type { ChangeNotifier } from "../db/notify.js";
import type { Job, JobQueue } from "./queue.js";

/**
 * Runs one job. Throwing fails the attempt; the queue retries it with backoff until
 * `maxAttempts`. Handlers must be idempotent: a job whose worker dies mid-run is
 * re-claimed after its lease expires and runs again.
 */
export type JobHandler = (job: Job) => Promise<void>;

/**
 * Handlers by job type. Modules register theirs here as they land: derivative
 * generation (#59), moderation notifications, print dispatch (#72), RSVP
 * confirmation emails (ADR-012).
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
  /**
   * Wakes the idle wait when a job is queued (Postgres NOTIFY on `grad_jobs`,
   * ADR-014), so an upload's derivatives start at once instead of up to one
   * poll interval later. A hint only: the poll still runs without it.
   */
  wake?: ChangeNotifier;
}

/** Waits `ms`, or less when `signal` aborts or the function handed to `onWake` is called. */
function sleep(ms: number, signal: AbortSignal, onWake?: (wake: () => void) => void): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      onWake?.(() => {});
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
    onWake?.(done);
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
  const { signal, pollIntervalMs = 1000, logger, wake } = options;
  // A notification that lands while a claim is in flight is remembered, so the
  // next idle wait is skipped instead of missing the job by one interval.
  let woken = false;
  let wakeSleeper: () => void = () => {};
  const onNotify = () => {
    woken = true;
    wakeSleeper();
  };
  wake?.start({ onNotify, onReconnect: onNotify });
  try {
    while (!signal.aborted) {
      woken = false;
      let worked = false;
      try {
        worked = await runOnce(options);
      } catch (err) {
        // Claim or bookkeeping failed (e.g. Postgres briefly unreachable): back off and keep polling.
        logger.error({ error: err instanceof Error ? err.message : String(err) }, "worker poll failed");
      }
      if (!worked && !woken) {
        await sleep(pollIntervalMs, signal, (done) => {
          wakeSleeper = done;
        });
      }
    }
  } finally {
    await wake?.stop();
  }
}
