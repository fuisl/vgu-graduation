import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ClaimedPrintJob } from "@grad/contract";
import { ApiError, type PrintApi } from "./api.js";
import { Backoff } from "./backoff.js";
import { Journal, type JournalEntry } from "./journal.js";
import { silentLogger, summarize, type Logger } from "./log.js";
import type { Printer } from "./printer.js";

/** Reported when a crash hit between handing a job to CUPS and recording that CUPS took it. */
export const AMBIGUOUS_ERROR =
  "Interrupted while sending to the printer; not retried to avoid a duplicate print. Check the printer and re-queue if nothing came out.";

export type TickResult = "idle" | "worked";

export interface DaemonOptions {
  api: PrintApi;
  printer: Printer;
  journal: Journal;
  stateDir: string;
  logger?: Logger;
  pollIntervalMs: number;
  backoff: Backoff;
  journalRetentionMs: number;
  /** Minimum lease left to start printing a claimed job (see config LEASE_MARGIN_MS). */
  leaseMarginMs: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

/**
 * Polls the API's print queue, prints each job once and reports the outcome.
 *
 * Every step is journalled before it is taken (journal.ts), and journalled work
 * is always finished before a new job is taken, so after a crash or restart:
 * - a job that never reached CUPS is printed (nothing came out yet);
 * - a job CUPS accepted is reported `done` again, never reprinted;
 * - a job that may or may not have reached CUPS is reported `failed` with
 *   AMBIGUOUS_ERROR, never reprinted;
 * - a job the API hands out again (a lost report or a lease that ran out after
 *   printing) gets its recorded outcome re-sent instead of a second print.
 *
 * Leases: the API holds a claimed job for PRINT_LEASE_SECONDS, then re-queues it
 * (and any daemon may claim it again). So a job is only sent to the printer while
 * at least `leaseMarginMs` of its lease is left; otherwise it is dropped from the
 * journal unprinted and unreported, and printed when the API hands it out again
 * with a fresh lease. A report is always sent, even late: the API still accepts
 * it for a re-queued job, and that is what stops a second print.
 * Printing is therefore at most once per job id per STATE_DIR; reporting is at
 * least once (a repeated identical report is a 200; 404/409 count as settled).
 */
export class PrintDaemon {
  private readonly logger: Logger;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly spoolDir: string;
  private readonly now: () => number;
  private lastPrune = 0;

  constructor(private readonly options: DaemonOptions) {
    this.logger = options.logger ?? silentLogger;
    this.sleep = options.sleep ?? abortableSleep;
    this.now = options.now ?? Date.now;
    this.spoolDir = path.join(options.stateDir, "spool");
  }

  async init() {
    await this.options.journal.init();
    await mkdir(this.spoolDir, { recursive: true });
  }

  /** One unit of work: finish journalled work first, otherwise take the next job. */
  async tick(): Promise<TickResult> {
    const { api, journal } = this.options;
    const [pending] = await journal.unfinished();
    if (pending) {
      await this.settle(pending);
      return "worked";
    }

    const job = await api.next();
    if (!job) return "idle";

    const known = await journal.get(job.id);
    if (known) {
      this.logger.warn("job handed out again; not reprinting", { jobId: job.id, phase: known.phase });
      await this.settle(known);
      return "worked";
    }

    this.logger.info("job received", { jobId: job.id, copies: job.copies, attempt: job.attempt });
    await this.settle(await journal.put(this.fromJob(job)));
    return "worked";
  }

  /** Runs until `signal` aborts; the job in hand is finished first (lp is never interrupted). */
  async run(signal: AbortSignal) {
    const { backoff, pollIntervalMs } = this.options;
    this.logger.info("printer daemon started", { pollIntervalMs });
    while (!signal.aborted) {
      try {
        const result = await this.tick();
        backoff.reset();
        if (result === "idle") {
          await this.pruneJournal();
          await this.sleep(pollIntervalMs, signal);
        }
      } catch (err) {
        const delayMs = backoff.next();
        this.logger.warn("print loop error; backing off", {
          error: summarize(err),
          status: err instanceof ApiError ? err.status : undefined,
          attempt: backoff.attempts,
          delayMs,
        });
        await this.sleep(delayMs, signal);
      }
    }
    this.logger.info("printer daemon stopped");
  }

  private fromJob(job: ClaimedPrintJob): Omit<JournalEntry, "updatedAt"> {
    return {
      id: job.id,
      photoPublicId: job.photoPublicId,
      copies: job.copies,
      imageUrl: job.imageUrl,
      attempt: job.attempt,
      leaseExpiresAt: job.leaseExpiresAt,
      phase: "received",
    };
  }

  /** True while enough of the claim's lease is left to print and report safely. */
  private leaseHolds(entry: JournalEntry): boolean {
    const expires = Date.parse(entry.leaseExpiresAt);
    return Number.isFinite(expires) && expires - this.now() >= this.options.leaseMarginMs;
  }

  private async settle(entry: JournalEntry): Promise<void> {
    const { journal } = this.options;
    switch (entry.phase) {
      case "received":
        return this.print(entry);
      case "submitting":
        this.logger.warn("found a job interrupted mid-submission; reporting it failed", { jobId: entry.id });
        return this.report(await journal.put({ ...entry, phase: "failed", error: AMBIGUOUS_ERROR }));
      case "printed":
      case "failed":
        return this.report(entry);
      case "reported":
        // Re-delivered after a report the API never recorded: send the same outcome again.
        return this.report({ ...entry, phase: entry.outcome === "done" ? "printed" : "failed" });
    }
  }

  /** Forgets a claim whose lease ran out before printing: nothing printed, nothing reported. */
  private async abandon(entry: JournalEntry): Promise<void> {
    this.logger.warn("lease ran out before printing; leaving the job to the API's re-queue", {
      jobId: entry.id,
      attempt: entry.attempt,
    });
    await this.options.journal.remove(entry.id);
    await rm(path.join(this.spoolDir, `${entry.id}.jpg`), { force: true });
  }

  private async print(entry: JournalEntry): Promise<void> {
    const { api, journal, printer } = this.options;
    if (!this.leaseHolds(entry)) return this.abandon(entry);
    let image: Buffer;
    try {
      image = await api.fetchImage(entry.imageUrl);
    } catch (err) {
      if (err instanceof ApiError && !err.retryable) {
        // Hidden, removed or never processed: a permanent answer, nothing to print.
        const error = `Photo is not available to print (${err.status ?? "error"})`;
        return this.report(await journal.put({ ...entry, phase: "failed", error }));
      }
      throw err; // Retry later; the entry stays `received`, so nothing is lost or doubled.
    }

    const file = path.join(this.spoolDir, `${entry.id}.jpg`);
    await writeFile(file, image);
    // The download may have taken a while (retries); check the lease again right before CUPS.
    if (!this.leaseHolds(entry)) return this.abandon(entry);
    const submitting = await journal.put({ ...entry, phase: "submitting" });
    try {
      await printer.print({ jobId: entry.id, file, copies: entry.copies });
    } catch (err) {
      this.logger.error("print failed", { jobId: entry.id, error: summarize(err) });
      await rm(file, { force: true });
      return this.report(await journal.put({ ...submitting, phase: "failed", error: summarize(err, 500) }));
    }
    const printed = await journal.put({ ...submitting, phase: "printed" });
    await rm(file, { force: true });
    this.logger.info("job printed", { jobId: entry.id, copies: entry.copies });
    return this.report(printed);
  }

  private async report(entry: JournalEntry): Promise<void> {
    const { api, journal } = this.options;
    const outcome = entry.phase === "printed" ? "done" : "failed";
    const body =
      outcome === "done"
        ? ({ result: "done" } as const)
        : ({ result: "failed", error: (entry.error ?? "Print failed").slice(0, 500) } as const);
    try {
      const answer = await api.complete(entry.id, body);
      const late = Date.parse(entry.leaseExpiresAt) < this.now();
      this.logger.info("job reported", { jobId: entry.id, outcome, answer, late });
    } catch (err) {
      // A request the API rejects as malformed will never succeed: record it and
      // move on rather than wedge the queue. Anything else is retried with backoff.
      if (err instanceof ApiError && (err.status === 400 || err.status === 422)) {
        this.logger.error("API rejected the report; giving up on it", { jobId: entry.id, status: err.status });
      } else {
        throw err;
      }
    }
    await journal.put({ ...entry, phase: "reported", outcome });
  }

  private async pruneJournal() {
    const now = Date.now();
    if (now - this.lastPrune < 3_600_000) return;
    this.lastPrune = now;
    const removed = await this.options.journal.prune(this.options.journalRetentionMs);
    if (removed > 0) this.logger.debug("journal pruned", { removed });
  }
}
