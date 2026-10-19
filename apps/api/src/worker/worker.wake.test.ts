import { describe, expect, it, vi } from "vitest";
import type { Job } from "./queue.js";
import { runWorker } from "./worker.js";

const job = (): Job => ({ id: "00000000-0000-0000-0000-000000000001", type: "demo", payload: {}, attempts: 1, maxAttempts: 3 });

describe("runWorker wake-up (ADR-014)", () => {
  it("claims a newly queued job at once instead of sleeping out the idle interval", async () => {
    const jobs: Job[] = [];
    const queue = {
      claim: vi.fn(async () => jobs.shift() ?? null),
      complete: vi.fn(async () => {}),
      fail: vi.fn(async () => {}),
    };
    const handler = vi.fn(async () => {});
    const controller = new AbortController();
    let notify: () => void = () => {};
    const wake = {
      start: vi.fn((handlers: { onNotify: () => void }) => {
        notify = handlers.onNotify;
      }),
      stop: vi.fn(async () => {}),
    };
    const done = runWorker({
      queue,
      handlers: { demo: handler },
      workerId: "w1",
      logger: { info: vi.fn(), error: vi.fn() },
      signal: controller.signal,
      pollIntervalMs: 60_000,
      wake,
    });
    await vi.waitFor(() => expect(queue.claim).toHaveBeenCalledTimes(1));

    jobs.push(job());
    notify();
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce(), { timeout: 500 });

    controller.abort();
    await done;
    expect(wake.stop).toHaveBeenCalledOnce();
  });

  it("does not sleep when a notification arrived during an empty claim", async () => {
    const jobs: Job[] = [];
    let notify: () => void = () => {};
    const handler = vi.fn(async () => {});
    const queue = {
      claim: vi.fn(async () => {
        const next = jobs.shift() ?? null;
        // The job commits (and its NOTIFY lands) just after this claim saw an empty queue.
        if (!next && queue.claim.mock.calls.length === 1) {
          jobs.push(job());
          notify();
        }
        return next;
      }),
      complete: vi.fn(async () => {}),
      fail: vi.fn(async () => {}),
    };
    const controller = new AbortController();
    const done = runWorker({
      queue,
      handlers: { demo: handler },
      workerId: "w1",
      logger: { info: vi.fn(), error: vi.fn() },
      signal: controller.signal,
      pollIntervalMs: 60_000,
      wake: {
        start: (handlers) => {
          notify = handlers.onNotify;
        },
        stop: async () => {},
      },
    });
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce(), { timeout: 500 });
    controller.abort();
    await done;
  });
});
