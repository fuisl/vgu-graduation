import { describe, expect, it, vi } from "vitest";
import { retryDelayMs, type Job } from "./queue.js";
import { runOnce, runWorker, type WorkerLogger } from "./worker.js";

const job = (overrides: Partial<Job> = {}): Job => ({
  id: "00000000-0000-0000-0000-000000000001",
  type: "demo",
  payload: { photoId: "p1" },
  attempts: 1,
  maxAttempts: 3,
  ...overrides,
});

function fakeQueue(jobs: Job[]) {
  return {
    claim: vi.fn(async (_workerId?: string) => jobs.shift() ?? null),
    complete: vi.fn(async (_job: Job, _workerId: string) => {}),
    fail: vi.fn(async (_job: Job, _workerId: string, _error: unknown) => {}),
  };
}

const logger = (): WorkerLogger & { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> } => ({
  info: vi.fn(),
  error: vi.fn(),
});

describe("runOnce", () => {
  it("returns false when nothing is due", async () => {
    const queue = fakeQueue([]);
    expect(await runOnce({ queue, handlers: {}, workerId: "w1", logger: logger() })).toBe(false);
  });

  it("runs the handler and completes the job", async () => {
    const queue = fakeQueue([job()]);
    const handler = vi.fn(async () => {});
    const log = logger();
    expect(await runOnce({ queue, handlers: { demo: handler }, workerId: "w1", logger: log })).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
    expect(queue.complete).toHaveBeenCalledWith(expect.objectContaining({ id: job().id }), "w1");
    expect(queue.fail).not.toHaveBeenCalled();
  });

  it("fails the attempt when the handler throws, and never logs the payload", async () => {
    const queue = fakeQueue([job()]);
    const log = logger();
    const boom = new Error("resize failed");
    await runOnce({ queue, handlers: { demo: async () => Promise.reject(boom) }, workerId: "w1", logger: log });
    expect(queue.fail).toHaveBeenCalledWith(expect.objectContaining({ id: job().id }), "w1", boom);
    expect(queue.complete).not.toHaveBeenCalled();
    expect(log.error.mock.calls[0]![1]).toBe("job failed, will retry");
    expect(JSON.stringify(log.error.mock.calls)).not.toContain("photoId");
  });

  it("reports the last attempt as permanent", async () => {
    const queue = fakeQueue([job({ attempts: 3 })]);
    const log = logger();
    await runOnce({ queue, handlers: { demo: async () => Promise.reject(new Error("x")) }, workerId: "w1", logger: log });
    expect(log.error.mock.calls[0]![1]).toBe("job failed permanently");
  });

  it("fails jobs of an unregistered type instead of dropping them", async () => {
    const queue = fakeQueue([job({ type: "unknown" })]);
    await runOnce({ queue, handlers: {}, workerId: "w1", logger: logger() });
    expect(queue.fail).toHaveBeenCalledOnce();
    expect(String(queue.fail.mock.calls[0]![2])).toContain('"unknown"');
  });
});

describe("runWorker", () => {
  it("drains the queue, keeps polling through errors, and stops on abort", async () => {
    const controller = new AbortController();
    const queue = fakeQueue([job(), job({ id: "00000000-0000-0000-0000-000000000002" })]);
    const originalClaim = queue.claim.getMockImplementation()!;
    let calls = 0;
    queue.claim.mockImplementation(async () => {
      calls += 1;
      if (calls === 2) throw new Error("connection reset");
      const next = await originalClaim();
      if (!next) controller.abort();
      return next;
    });
    const handler = vi.fn(async () => {});
    const log = logger();

    await runWorker({ queue, handlers: { demo: handler }, workerId: "w1", logger: log, signal: controller.signal, pollIntervalMs: 1 });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(log.error).toHaveBeenCalledWith({ error: "connection reset" }, "worker poll failed");
  });
});

describe("retryDelayMs", () => {
  it("doubles from 10s and caps at 10 minutes", () => {
    expect([1, 2, 3].map(retryDelayMs)).toEqual([10_000, 20_000, 40_000]);
    expect(retryDelayMs(20)).toBe(600_000);
  });
});
