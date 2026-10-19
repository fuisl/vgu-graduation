import type { LiveGalleryMessage } from "@grad/contract";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DisplayFeed } from "./display.feed.js";
import type { DisplayChange, DisplaySource } from "./display.repository.js";

const T0 = new Date("2026-11-15T03:00:00.000Z");

function wish(id: string, at: Date): DisplayChange {
  return {
    key: `wish:${id}`,
    version: at.toISOString(),
    updatedAt: at,
    message: { type: "wish", wish: { id, authorName: "Jane", body: id, createdAt: at.toISOString() } },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("DisplayFeed.nudge (ADR-014)", () => {
  it("broadcasts a change at once instead of on the next tick", async () => {
    vi.useFakeTimers();
    const rows: DisplayChange[] = [];
    let clock = T0.getTime();
    const source: DisplaySource = {
      now: async () => new Date(clock),
      changesSince: vi.fn(async (since: Date) => rows.filter((r) => r.updatedAt > since)),
      snapshot: async () => [],
    };
    const sent: LiveGalleryMessage[] = [];
    const feed = new DisplayFeed(source, { broadcast: (m) => void sent.push(m) }, { error: vi.fn() }, { pollMs: 60_000, keepaliveMs: 600_000 });
    feed.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(source.changesSince).toHaveBeenCalledTimes(1);

    clock += 1_000;
    rows.push(wish("new", new Date(clock)));
    feed.nudge();
    await vi.advanceTimersByTimeAsync(1);
    expect(sent.map((m) => m.type)).toEqual(["wish"]);
    feed.stop();
  });

  it("coalesces a burst into the poll in flight plus one more", async () => {
    vi.useFakeTimers();
    let release: () => void = () => {};
    let calls = 0;
    const source: DisplaySource = {
      now: async () => T0,
      changesSince: async () => {
        calls++;
        if (calls === 2) await new Promise<void>((resolve) => (release = resolve));
        return [];
      },
      snapshot: async () => [],
    };
    const feed = new DisplayFeed(source, { broadcast: () => {} }, { error: vi.fn() }, { pollMs: 60_000, keepaliveMs: 600_000 });
    feed.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(1);

    feed.nudge();
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(2); // in flight
    feed.nudge();
    feed.nudge();
    feed.nudge();
    release();
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(3); // exactly one follow-up
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toBe(3);
    feed.stop();
  });

  it("is a no-op while stopped", async () => {
    vi.useFakeTimers();
    const source: DisplaySource = { now: vi.fn(async () => T0), changesSince: async () => [], snapshot: async () => [] };
    const feed = new DisplayFeed(source, { broadcast: () => {} }, { error: vi.fn() });
    feed.nudge();
    await vi.advanceTimersByTimeAsync(10);
    expect(source.now).not.toHaveBeenCalled();
  });
});
