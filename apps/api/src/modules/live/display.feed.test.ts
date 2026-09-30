import type { LiveDisplayMessage } from "@grad/contract";
import { describe, expect, it, vi } from "vitest";
import { DisplayFeed } from "./display.feed.js";
import type { DisplayChange, DisplaySource } from "./display.repository.js";

const T0 = new Date("2026-11-15T03:00:00.000Z");
const at = (s: number) => new Date(T0.getTime() + s * 1000);

function wishChange(id: string, s: number, visible = true): DisplayChange {
  return {
    key: `wish:${id}`,
    version: at(s).toISOString(),
    updatedAt: at(s),
    message: visible
      ? { type: "wish", wish: { id, authorName: "Jane", body: id, createdAt: T0.toISOString() } }
      : { type: "hidden", kind: "wish", id },
  };
}

/** A source whose clock and rows the test moves by hand; changesSince honors `since`. */
function fakeSource() {
  const state = { now: T0, rows: [] as DisplayChange[] };
  const source: DisplaySource = {
    now: async () => state.now,
    changesSince: vi.fn(async (since: Date) => state.rows.filter((r) => r.updatedAt > since)),
    snapshot: vi.fn(async () => [{ type: "wish", wish: { id: "w0", authorName: "A", body: "b", createdAt: T0.toISOString() } }] as LiveDisplayMessage[]),
  };
  return { state, source };
}

function setup(options = {}) {
  const { state, source } = fakeSource();
  const sent: LiveDisplayMessage[] = [];
  const feed = new DisplayFeed(source, { broadcast: (m) => void sent.push(m) }, { error: vi.fn() }, { overlapMs: 5000, keepaliveMs: 60_000, ...options });
  return { state, source, sent, feed };
}

describe("DisplayFeed.poll", () => {
  it("starts from the database clock, then broadcasts new changes once", async () => {
    const { state, sent, feed, source } = setup();
    state.now = at(10);
    await feed.poll();
    expect(source.changesSince).toHaveBeenLastCalledWith(at(5));
    expect(sent).toEqual([]);

    state.rows.push(wishChange("a", 11));
    state.now = at(12);
    await feed.poll();
    expect(sent.map((m) => m.type)).toEqual(["wish"]);

    // Still inside the overlap window next time: not repeated.
    state.now = at(14);
    await feed.poll();
    expect(sent).toHaveLength(1);
  });

  it("catches a row that committed after the poll passed its timestamp", async () => {
    const { state, sent, feed } = setup();
    state.now = at(10);
    await feed.poll();
    state.now = at(20);
    await feed.poll();
    // Written in a transaction that began at 18 but committed only now.
    state.rows.push(wishChange("late", 18));
    state.now = at(22);
    await feed.poll();
    expect(sent).toEqual([wishChange("late", 18).message]);
  });

  it("sends a new state of the same item", async () => {
    const { state, sent, feed } = setup();
    state.now = at(10);
    await feed.poll();
    state.rows.push(wishChange("a", 11));
    state.now = at(12);
    await feed.poll();
    state.rows = [wishChange("a", 13, false)];
    state.now = at(14);
    await feed.poll();
    expect(sent.map((m) => m.type)).toEqual(["wish", "hidden"]);
  });

  it("emits a keepalive with the cursor when one is due", async () => {
    const { state, sent, feed } = setup({ keepaliveMs: 0 });
    state.now = at(10);
    await feed.poll();
    expect(sent).toEqual([{ type: "keepalive", until: at(10).toISOString() }]);
  });
});

describe("DisplayFeed.catchUp", () => {
  it("returns the snapshot without since", async () => {
    const { state, feed, source } = setup();
    state.now = at(30);
    const res = await feed.catchUp();
    expect(source.snapshot).toHaveBeenCalledWith(100);
    expect(res).toMatchObject({ until: at(30).toISOString(), messages: [{ type: "wish" }] });
  });

  it("returns every change after since, looking back by the overlap", async () => {
    const { state, feed, source } = setup();
    state.rows.push(wishChange("old", 1), wishChange("a", 8), wishChange("b", 9, false));
    state.now = at(30);
    const res = await feed.catchUp(at(10));
    expect(source.changesSince).toHaveBeenCalledWith(at(5));
    expect(res.messages).toEqual([wishChange("a", 8).message, wishChange("b", 9, false).message]);
  });
});

describe("DisplayFeed loop", () => {
  it("keeps polling after a failed poll and stops cleanly", async () => {
    vi.useFakeTimers();
    const { source } = fakeSource();
    let calls = 0;
    source.now = async () => {
      calls++;
      if (calls === 1) throw new Error("db blip");
      return T0;
    };
    const log = { error: vi.fn() };
    const feed = new DisplayFeed(source, { broadcast: () => {} }, log, { pollMs: 100 });
    feed.start();
    await vi.advanceTimersByTimeAsync(250);
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(calls).toBeGreaterThanOrEqual(3);
    feed.stop();
    const after = calls;
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toBe(after);
    vi.useRealTimers();
  });
});
