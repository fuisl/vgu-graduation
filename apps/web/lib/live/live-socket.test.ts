import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSocket, liveSocketUrl, type LiveSocketState, type SocketLike } from "./live-socket";

class FakeSocket implements SocketLike {
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;
  closed = false;
  constructor(readonly url: string) {}
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.({});
  }
  message(data: unknown) {
    this.onmessage?.({ data });
  }
  fail() {
    this.onclose?.({});
  }
}

function setup(overrides: Partial<ConstructorParameters<typeof LiveSocket>[0]> = {}) {
  const sockets: FakeSocket[] = [];
  const messages: string[] = [];
  const states: LiveSocketState[] = [];
  const opens: boolean[] = [];
  const live = new LiveSocket({
    url: "wss://api.example.test/live/display",
    onMessage: (data) => messages.push(data),
    onOpen: ({ reconnect }) => opens.push(reconnect),
    onStateChange: (state) => states.push(state),
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    random: () => 1,
    now: () => Date.now(),
    backoff: { baseMs: 1_000, maxMs: 8_000, minMs: 500 },
    ...overrides,
  });
  return { live, sockets, messages, states, opens, last: () => sockets[sockets.length - 1]! };
}

describe("LiveSocket", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("delivers string messages and ignores binary frames", () => {
    const { live, last, messages, opens } = setup();
    live.start();
    last().open();
    last().message('{"type":"keepalive"}');
    last().message(new ArrayBuffer(2));
    expect(messages).toEqual(['{"type":"keepalive"}']);
    expect(opens).toEqual([false]);
    live.stop();
  });

  it("backs off exponentially while attempts keep failing", () => {
    const { live, sockets, last, states } = setup();
    live.start();
    last().fail();
    expect(states.at(-1)).toMatchObject({ phase: "waiting", failures: 1, retryInMs: 1_000 });
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
    last().fail();
    expect(states.at(-1)).toMatchObject({ phase: "waiting", retryInMs: 2_000 });
    vi.advanceTimersByTime(2_000);
    last().fail();
    vi.advanceTimersByTime(4_000);
    last().fail();
    vi.advanceTimersByTime(8_000);
    last().fail();
    expect(states.at(-1)).toMatchObject({ phase: "waiting", failures: 5, retryInMs: 8_000 });
    live.stop();
  });

  it("resets the failure count only after a stable connection", () => {
    const { live, last, states, opens } = setup({ stableMs: 5_000 });
    live.start();
    last().open();
    last().fail(); // dropped at once: still counts
    vi.advanceTimersByTime(1_000);
    last().open();
    last().fail();
    expect(states.at(-1)).toMatchObject({ phase: "waiting", failures: 2, retryInMs: 2_000 });
    vi.advanceTimersByTime(2_000);
    last().open();
    vi.advanceTimersByTime(6_000);
    last().fail();
    expect(states.at(-1)).toMatchObject({ phase: "waiting", failures: 1, retryInMs: 1_000 });
    expect(opens).toEqual([false, true, true]);
    live.stop();
  });

  it("reconnects when the idle watchdog fires, without waiting for the close event", () => {
    const { live, sockets, last } = setup({ idleTimeoutMs: 60_000 });
    live.start();
    last().open();
    vi.advanceTimersByTime(59_000);
    last().message("{}");
    vi.advanceTimersByTime(59_000);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1_000);
    expect(sockets[0]!.closed).toBe(true);
    expect(sockets[0]!.onmessage).toBeNull();
    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(2);
    live.stop();
  });

  it("abandons an attempt that never opens", () => {
    const { live, sockets } = setup({ connectTimeoutMs: 10_000 });
    live.start();
    vi.advanceTimersByTime(10_000);
    expect(sockets[0]!.closed).toBe(true);
    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(2);
    live.stop();
  });

  it("ignores events from a dropped socket", () => {
    const { live, sockets, messages } = setup();
    live.start();
    const first = sockets[0]!;
    first.open();
    const onmessage = first.onmessage;
    first.fail();
    onmessage?.({ data: "late" });
    expect(messages).toEqual([]);
    live.stop();
  });

  it("reconnectNow skips the wait", () => {
    const { live, sockets, last } = setup();
    live.start();
    last().fail();
    live.reconnectNow();
    expect(sockets).toHaveLength(2);
    live.reconnectNow(); // already connecting: no-op
    expect(sockets).toHaveLength(2);
    live.stop();
  });

  it("leaves no timers or sockets behind after stop", () => {
    const { live, sockets, last } = setup({ idleTimeoutMs: 60_000 });
    live.start();
    last().open();
    live.stop();
    expect(sockets[0]!.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    live.start();
    last().fail();
    live.stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(2);
  });

  it("keeps a bounded number of timers over many hours of flapping", () => {
    const { live, last } = setup({ idleTimeoutMs: 60_000, connectTimeoutMs: 10_000 });
    live.start();
    for (let i = 0; i < 2_000; i += 1) {
      if (i % 3 === 0) last().open();
      if (i % 2 === 0) last().fail();
      vi.advanceTimersByTime(9_000);
      expect(vi.getTimerCount()).toBeLessThanOrEqual(2);
    }
    live.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("liveSocketUrl", () => {
  it("maps http(s) origins to ws(s)", () => {
    expect(liveSocketUrl("/live/display", "https://api.example.test")).toBe("wss://api.example.test/live/display");
    expect(liveSocketUrl("/live/translation", "http://localhost:4000")).toBe("ws://localhost:4000/live/translation");
  });
});
