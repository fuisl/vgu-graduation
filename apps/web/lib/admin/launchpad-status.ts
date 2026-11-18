import type { AdminPrintJobsResponse } from "@grad/contract";
import { listPrintJobs } from "../api/admin";
import { apiFetch } from "../api/client";
import { parsePendingCount, withTimeout, type PendingCount } from "./launchpad";

/** Each status call gets this long; past it the line shows as unavailable and the page renders anyway. */
const STATUS_TIMEOUT_MS = 2500;

export type LaunchpadStatus = {
  apiUp: boolean;
  /** null when the print queue could not be read. */
  print: AdminPrintJobsResponse["counts"] | null;
  /** null hides the line (API without ADR-019's `pending` status, or any failure). */
  pending: PendingCount | null;
};

async function apiReachable(): Promise<boolean> {
  const response = await apiFetch("/healthz", { cache: { mode: "no-store" } });
  return response.ok;
}

async function printCounts(token: string): Promise<LaunchpadStatus["print"]> {
  const page = await listPrintJobs(token, { limit: 1 });
  return page.status === "ok" ? page.data.counts : null;
}

async function pendingPhotos(token: string): Promise<PendingCount | null> {
  // The token goes in the header only, never in the URL or a log line.
  const response = await apiFetch("/admin/media/pending-count", {
    headers: { Authorization: `Bearer ${token}` },
    cache: { mode: "no-store" },
  });
  const body: unknown = await response.json().catch(() => null);
  return parsePendingCount(response.status, body);
}

/** Cheap, parallel, and never throws: a failed or slow call degrades its own line. */
export async function getLaunchpadStatus(token: string): Promise<LaunchpadStatus> {
  const [apiUp, print, pending] = await Promise.all([
    withTimeout(apiReachable(), STATUS_TIMEOUT_MS, false),
    withTimeout(printCounts(token), STATUS_TIMEOUT_MS, null),
    withTimeout(pendingPhotos(token), STATUS_TIMEOUT_MS, null),
  ]);
  return { apiUp, print, pending };
}
