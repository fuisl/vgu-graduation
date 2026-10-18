import type { AdminPrintJob, AdminPrintJobsResponse, PrintJobStatus } from "@grad/contract";
import { backoffDelay } from "../live/backoff";

/*
 * Admin print queue (#74, experimental). The page polls while it is open: every
 * few seconds while the API answers, backing off on failures, paused while the
 * tab is hidden. Printing never blocks anything else on the day.
 */

export type PrintCounts = AdminPrintJobsResponse["counts"];

export const PRINT_STATUSES: { status: PrintJobStatus; label: string }[] = [
  { status: "queued", label: "Queued" },
  { status: "printing", label: "Printing" },
  { status: "done", label: "Done" },
  { status: "failed", label: "Failed" },
];

export const PRINT_PAGE_SIZE = 30;

/** Poll cadence while the API answers. */
export const PRINT_POLL_MS = 5_000;
const PRINT_POLL_MAX_MS = 60_000;

/** Delay before the next poll: steady while healthy, exponential with jitter after consecutive failures. */
export function nextPollDelay(failures: number, random: () => number = Math.random): number {
  if (failures <= 0) return PRINT_POLL_MS;
  return backoffDelay(failures, { baseMs: PRINT_POLL_MS, maxMs: PRINT_POLL_MAX_MS, minMs: PRINT_POLL_MS }, random);
}

/**
 * A queued job that has waited this long with nothing printing means the
 * printer daemon is away (offline, suspended, or the venue node is down). The
 * daemon claims jobs within seconds when it runs, so two minutes is generous.
 */
export const PRINT_STALL_MS = 2 * 60_000;

export type PrinterState =
  | { kind: "idle" }
  | { kind: "busy"; queued: number; printing: number }
  | { kind: "stalled"; queued: number; since: string | null };

/**
 * What the queue says about the printer. `jobs` is what's loaded (newest
 * first), or null when the view is filtered to other states and shows no
 * queued jobs. Queued jobs beyond the loaded ones are older than anything
 * loaded, so they have waited at least as long as the oldest one on screen.
 */
export function printerState(counts: PrintCounts, jobs: readonly AdminPrintJob[] | null, now: number): PrinterState {
  if (counts.queued === 0 && counts.printing === 0) return { kind: "idle" };
  if (counts.printing > 0 || counts.queued === 0 || jobs === null) {
    return { kind: "busy", queued: counts.queued, printing: counts.printing };
  }
  const queued = jobs.filter((job) => job.status === "queued");
  const oldest = queued.reduce<string | null>(
    (min, job) => (min === null || Date.parse(job.createdAt) < Date.parse(min) ? job.createdAt : min),
    null
  );
  const unseen = counts.queued > queued.length;
  const waited = oldest === null ? Infinity : now - Date.parse(oldest);
  if (unseen || waited >= PRINT_STALL_MS) return { kind: "stalled", queued: counts.queued, since: unseen ? null : oldest };
  return { kind: "busy", queued: counts.queued, printing: 0 };
}

/**
 * Folds a freshly polled first page into what's on screen: the fresh page
 * first (newest jobs, current states), then older loaded jobs it doesn't
 * cover, so "Load older" results survive a refresh.
 */
export function mergePolledJobs(current: readonly AdminPrintJob[], fresh: readonly AdminPrintJob[]): AdminPrintJob[] {
  const freshIds = new Set(fresh.map((job) => job.id));
  return [...fresh, ...current.filter((job) => !freshIds.has(job.id))];
}

/** Counts after a job moved between states locally (a retry), until the next poll brings the real ones. */
export function moveCount(counts: PrintCounts, from: PrintJobStatus, to: PrintJobStatus): PrintCounts {
  if (from === to) return counts;
  return { ...counts, [from]: Math.max(0, counts[from] - 1), [to]: counts[to] + 1 };
}

export function parsePrintStatus(raw: string | string[] | undefined): PrintJobStatus | undefined {
  return PRINT_STATUSES.find((option) => option.status === raw)?.status;
}

export function printHref(status: PrintJobStatus | undefined): string {
  return status ? `/admin/print?status=${status}` : "/admin/print";
}
