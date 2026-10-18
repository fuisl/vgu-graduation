import type { AdminPrintJob } from "@grad/contract";
import { describe, expect, it } from "vitest";
import {
  mergePolledJobs,
  moveCount,
  nextPollDelay,
  parsePrintStatus,
  PRINT_POLL_MS,
  PRINT_STALL_MS,
  printerState,
} from "./print-queue";

const NOW = Date.parse("2026-11-21T03:10:00.000Z");

function job(id: string, status: AdminPrintJob["status"], minutesAgo: number): AdminPrintJob {
  const at = new Date(NOW - minutesAgo * 60_000).toISOString();
  return {
    id,
    photoPublicId: `photo-${id}`,
    copies: 1,
    status,
    createdAt: at,
    requestedBy: "admin",
    attempts: 0,
    error: null,
    leaseExpiresAt: null,
    completedAt: null,
    updatedAt: at,
  };
}

const counts = (queued: number, printing = 0, done = 0, failed = 0) => ({ queued, printing, done, failed });

describe("printerState", () => {
  it("is idle with nothing queued or printing", () => {
    expect(printerState(counts(0, 0, 5, 1), [], NOW)).toEqual({ kind: "idle" });
  });

  it("is busy while something prints, however long others wait", () => {
    expect(printerState(counts(2, 1), [job("a", "queued", 30), job("b", "printing", 1)], NOW)).toEqual({
      kind: "busy",
      queued: 2,
      printing: 1,
    });
  });

  it("is busy (not stalled) when a job was queued moments ago", () => {
    expect(printerState(counts(1), [job("a", "queued", 0.5)], NOW).kind).toBe("busy");
  });

  it("calls the printer offline when a job waited past the threshold with nothing printing", () => {
    const oldest = job("a", "queued", PRINT_STALL_MS / 60_000 + 1);
    expect(printerState(counts(2), [job("b", "queued", 0.2), oldest], NOW)).toEqual({
      kind: "stalled",
      queued: 2,
      since: oldest.createdAt,
    });
  });

  it("treats queued jobs beyond the loaded page as waiting (they are older than anything loaded)", () => {
    expect(printerState(counts(3), [job("a", "queued", 0.2), job("b", "done", 1)], NOW)).toEqual({
      kind: "stalled",
      queued: 3,
      since: null,
    });
  });

  it("does not guess from a view filtered to other states", () => {
    expect(printerState(counts(3), null, NOW)).toEqual({ kind: "busy", queued: 3, printing: 0 });
  });
});

describe("polling", () => {
  it("polls steadily while healthy and backs off (capped) after failures", () => {
    expect(nextPollDelay(0)).toBe(PRINT_POLL_MS);
    expect(nextPollDelay(1, () => 1)).toBe(10_000);
    expect(nextPollDelay(3, () => 1)).toBe(40_000);
    expect(nextPollDelay(10, () => 1)).toBe(60_000);
    expect(nextPollDelay(10, () => 0)).toBe(PRINT_POLL_MS);
  });

  it("merges a fresh first page over loaded jobs, keeping older pages", () => {
    const current = [job("c", "queued", 1), job("b", "printing", 2), job("a", "done", 60)];
    const fresh = [job("d", "queued", 0), job("c", "printing", 1), job("b", "done", 2)];
    const merged = mergePolledJobs(current, fresh);
    expect(merged.map((j) => `${j.id}:${j.status}`)).toEqual(["d:queued", "c:printing", "b:done", "a:done"]);
  });

  it("moves a count locally after a retry", () => {
    expect(moveCount(counts(0, 0, 1, 2), "failed", "queued")).toEqual(counts(1, 0, 1, 1));
    expect(moveCount(counts(0, 0, 0, 0), "failed", "queued")).toEqual(counts(1, 0, 0, 0));
  });

  it("parses the status filter", () => {
    expect(parsePrintStatus("failed")).toBe("failed");
    expect(parsePrintStatus("lost")).toBeUndefined();
    expect(parsePrintStatus(undefined)).toBeUndefined();
  });
});
