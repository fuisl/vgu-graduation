"use client";

/* eslint-disable @next/next/no-img-element -- previews stream through the admin proxy; next/image would cache them */

import type { AdminPrintJob, AdminPrintJobsResponse, PrintJobStatus } from "@grad/contract";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_EVENT_TIME_ZONE, formatAdminDateTime } from "../../../lib/admin/datetime";
import {
  mergePolledJobs,
  moveCount,
  nextPollDelay,
  PRINT_POLL_MS,
  PRINT_STATUSES,
  printerState,
  printHref,
  type PrintCounts,
} from "../../../lib/admin/print-queue";
import { loadPrintJobsAction, retryPrintJobAction, type QueueResult } from "../queue-actions";

const UNREACHABLE = "Could not reach the server.";

async function settle<T>(call: () => Promise<QueueResult<T>>): Promise<QueueResult<T>> {
  try {
    const result = await call();
    return result && typeof result === "object" ? result : { ok: false, message: UNREACHABLE };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: DEFAULT_EVENT_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const when = (iso: string) => formatAdminDateTime(iso, DEFAULT_EVENT_TIME_ZONE);
const STATUS_LABEL = Object.fromEntries(PRINT_STATUSES.map(({ status, label }) => [status, label])) as Record<
  PrintJobStatus,
  string
>;

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

function copiesLabel(copies: number) {
  return `${copies} ${copies === 1 ? "copy" : "copies"}`;
}

function PrinterBanner({ counts, jobs, now }: { counts: PrintCounts; jobs: readonly AdminPrintJob[] | null; now: number }) {
  const state = printerState(counts, jobs, now);
  if (state.kind === "idle") return <p className="admin-muted">Nothing waiting to print.</p>;
  if (state.kind === "busy") {
    return (
      <p>
        {state.printing > 0 ? `Printing ${state.printing}. ` : null}
        {state.queued > 0 ? `${state.queued} waiting.` : null}
      </p>
    );
  }
  return (
    <div className="admin-notice admin-notice--error">
      <h2>Printer offline or queue waiting</h2>
      <p>
        {state.queued} {state.queued === 1 ? "job is" : "jobs are"} queued
        {state.since ? `, the oldest since ${clock.format(Date.parse(state.since))},` : ""} and nothing is printing.
        They stay queued and print in order once the venue printer is back. Check the printer and its daemon (event
        runbook, Printer).
      </p>
    </div>
  );
}

/**
 * The print queue with live counts. Polls every 5 seconds while the tab is
 * visible, backs off with jitter after failures (up to a minute) and refreshes
 * at once when the tab comes back. Failed jobs can be re-queued.
 */
export function PrintQueue({
  status,
  initial,
  renderedAt,
}: {
  status: PrintJobStatus | undefined;
  initial: AdminPrintJobsResponse;
  renderedAt: number;
}) {
  const [jobs, setJobs] = useState(initial.items);
  const [counts, setCounts] = useState(initial.counts);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState(renderedAt);
  const [now, setNow] = useState(renderedAt);
  const [refresh, setRefresh] = useState<{ error: string | null; nextMs: number }>({ error: null, nextMs: PRINT_POLL_MS });
  const [retrying, setRetrying] = useState<Record<string, true>>({});
  const [retryErrors, setRetryErrors] = useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = useState("");
  // Once older pages are loaded, polls must not move the cursor back to the first page's.
  const loadedOlder = useRef(false);
  const pollNow = useRef<() => void>(() => undefined);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (ms: number) => {
      clearTimeout(timer);
      if (!document.hidden) timer = setTimeout(poll, ms);
    };

    async function poll() {
      if (cancelled || inFlight || document.hidden) return;
      inFlight = true;
      clearTimeout(timer);
      const result = await settle(() => loadPrintJobsAction(status));
      inFlight = false;
      if (cancelled) return;
      if (result.ok) {
        failures = 0;
        setJobs((current) => mergePolledJobs(current, result.data.items));
        setCounts(result.data.counts);
        if (!loadedOlder.current) setCursor(result.data.nextCursor);
        setUpdatedAt(Date.now());
      } else {
        failures += 1;
      }
      const delay = nextPollDelay(failures);
      setNow(Date.now());
      setRefresh({ error: result.ok ? null : result.message, nextMs: delay });
      schedule(delay);
    }

    const onVisibility = () => {
      if (document.hidden) clearTimeout(timer);
      else void poll();
    };

    pollNow.current = () => void poll();
    document.addEventListener("visibilitychange", onVisibility);
    schedule(PRINT_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [status]);

  async function retry(job: AdminPrintJob) {
    if (retrying[job.id]) return;
    setRetrying((current) => ({ ...current, [job.id]: true }));
    setRetryErrors((current) => without(current, job.id));
    const result = await settle(() => retryPrintJobAction(job.id));
    if (result.ok) {
      setJobs((current) => current.map((candidate) => (candidate.id === job.id ? result.data : candidate)));
      setCounts((current) => moveCount(current, job.status, result.data.status));
      setAnnouncement(`Print job re-queued: ${copiesLabel(job.copies)}.`);
    } else {
      setRetryErrors((current) => ({ ...current, [job.id]: result.message }));
      setAnnouncement(`Retry failed. ${result.message}`);
    }
    setRetrying((current) => without(current, job.id));
  }

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadError(null);
    const result = await settle(() => loadPrintJobsAction(status, cursor));
    if (result.ok) {
      loadedOlder.current = true;
      setJobs((current) => [...current, ...result.data.items.filter((job) => !current.some((seen) => seen.id === job.id))]);
      setCursor(result.data.nextCursor);
      setCounts(result.data.counts);
    } else {
      setLoadError(result.message);
    }
    setLoadingMore(false);
  }

  const seesQueued = status === undefined || status === "queued";

  return (
    <>
      <dl className="admin-stats">
        {PRINT_STATUSES.map(({ status: key, label }) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{counts[key]}</dd>
          </div>
        ))}
      </dl>

      <PrinterBanner counts={counts} jobs={seesQueued ? jobs : null} now={now} />

      <p className="admin-hint admin-print-refresh">
        {refresh.error
          ? `Could not refresh: ${refresh.error} Trying again in ${Math.round(refresh.nextMs / 1000)} s.`
          : `Updated ${clock.format(updatedAt)}. Refreshes every ${PRINT_POLL_MS / 1000} s while this page is open.`}{" "}
        <button type="button" className="admin-link-button" onClick={() => pollNow.current()}>
          Refresh now
        </button>
      </p>

      <nav className="admin-filters" aria-label="Filter">
        <ul>
          <li>
            <Link href={printHref(undefined)} prefetch={false} aria-current={status === undefined ? "page" : undefined}>
              All
            </Link>
          </li>
          {PRINT_STATUSES.map(({ status: key, label }) => (
            <li key={key}>
              <Link href={printHref(key)} prefetch={false} aria-current={status === key ? "page" : undefined}>
                {label} {counts[key]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {jobs.length === 0 ? (
        <p>
          {status ? `No ${STATUS_LABEL[status].toLowerCase()} jobs.` : "No print jobs yet."} Queue one from{" "}
          <Link href="/admin/moderation">Moderation</Link> with Print on a visible photo.
        </p>
      ) : (
        <ul className="admin-jobs">
          {jobs.map((job) => (
            <li key={job.id} className="admin-job" data-status={job.status}>
              <img
                className="admin-job__thumb"
                src={`/admin/preview/${encodeURIComponent(job.photoPublicId)}/thumb`}
                alt=""
                width={64}
                height={64}
                loading="lazy"
                decoding="async"
              />
              <div className="admin-job__body">
                <p className="admin-queue-meta">
                  <span className="admin-queue-status" data-status={job.status}>
                    {STATUS_LABEL[job.status]}
                  </span>
                  <span>{copiesLabel(job.copies)}</span>
                  <span className="admin-muted">{when(job.createdAt)}</span>
                </p>
                <p className="admin-hint">
                  Requested by {job.requestedBy === "admin" ? "an admin" : "a guest"}
                  {job.attempts > 0 ? ` · ${job.attempts} ${job.attempts === 1 ? "attempt" : "attempts"}` : ""}
                  {job.completedAt ? ` · finished ${when(job.completedAt)}` : ""}
                </p>
                {job.error ? <p className="admin-hint">Printer said: {job.error}</p> : null}
                {job.status === "failed" ? (
                  <div className="admin-actions">
                    <span className="admin-hint">Check the tray first: an interrupted job may have printed.</span>
                    <button
                      type="button"
                      className="admin-button admin-button--outline"
                      onClick={() => void retry(job)}
                      disabled={Boolean(retrying[job.id])}
                      aria-disabled={Boolean(retrying[job.id])}
                    >
                      {retrying[job.id] ? "Re-queueing…" : "Retry"}
                    </button>
                  </div>
                ) : null}
                {retryErrors[job.id] ? (
                  <p role="alert" className="admin-field-error">
                    Retry failed: {retryErrors[job.id]}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {cursor ? (
        <div className="admin-queue-more">
          {loadError ? (
            <p role="alert" className="admin-field-error">
              Could not load more: {loadError}
            </p>
          ) : null}
          <button
            type="button"
            className="admin-button admin-button--outline"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            aria-disabled={loadingMore}
          >
            {loadingMore ? "Loading…" : loadError ? "Try again" : "Load older jobs"}
          </button>
        </div>
      ) : null}
    </>
  );
}
