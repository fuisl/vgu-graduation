import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ListenClient, PgListener } from "./notify.js";

class FakeClient extends EventEmitter implements ListenClient {
  queries: string[] = [];
  ended = false;
  constructor(private readonly failConnect = false) {
    super();
  }
  async connect() {
    if (this.failConnect) throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
  }
  async query(sql: string) {
    this.queries.push(sql);
  }
  async end() {
    this.ended = true;
  }
}

afterEach(() => {
  vi.useRealTimers();
});

function setup(failFirst = 0) {
  const clients: FakeClient[] = [];
  const log = { warn: vi.fn() };
  const listener = new PgListener({
    connectionString: "postgres://user:secret@db/grad26",
    channel: "grad_live",
    log,
    minRetryMs: 100,
    maxRetryMs: 400,
    createClient: () => {
      const client = new FakeClient(clients.length < failFirst);
      clients.push(client);
      return client;
    },
  });
  return { clients, log, listener };
}

describe("PgListener", () => {
  it("LISTENs on its channel and forwards only that channel's notifications", async () => {
    const { clients, listener } = setup();
    const onNotify = vi.fn();
    listener.start({ onNotify });
    await vi.waitFor(() => expect(clients[0]!.queries).toEqual(["LISTEN grad_live"]));
    clients[0]!.emit("notification", { channel: "grad_live", payload: "wishes" });
    clients[0]!.emit("notification", { channel: "other", payload: "x" });
    expect(onNotify).toHaveBeenCalledTimes(1);
    await listener.stop();
    expect(clients[0]!.ended).toBe(true);
  });

  it("reconnects with backoff after a failure, says so, and never logs the connection string", async () => {
    vi.useFakeTimers();
    const { clients, log, listener } = setup(2);
    const onReconnect = vi.fn();
    listener.start({ onNotify: () => {}, onReconnect });
    await vi.advanceTimersByTimeAsync(0);
    expect(clients).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(clients).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(200);
    expect(clients).toHaveLength(3);
    expect(clients[2]!.queries).toEqual(["LISTEN grad_live"]);
    // First successful connection is not a "re"connect.
    expect(onReconnect).not.toHaveBeenCalled();

    // A dropped connection comes back and reports it, so the feed can poll for what it missed.
    clients[2]!.emit("error", Object.assign(new Error("terminating connection"), { code: "57P01" }));
    await vi.advanceTimersByTimeAsync(100);
    expect(clients).toHaveLength(4);
    expect(onReconnect).toHaveBeenCalledTimes(1);

    expect(JSON.stringify(log.warn.mock.calls)).not.toContain("secret");
    expect(log.warn.mock.calls[0]![0]).toMatchObject({ channel: "grad_live", code: "ECONNREFUSED" });
    await listener.stop();
  });

  it("stops retrying once stopped", async () => {
    vi.useFakeTimers();
    const { clients, listener } = setup(10);
    listener.start({ onNotify: () => {} });
    await vi.advanceTimersByTimeAsync(0);
    await listener.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(clients).toHaveLength(1);
  });

  it("refuses a channel name that is not a plain identifier", () => {
    expect(() => new PgListener({ connectionString: "x", channel: "grad; DROP", log: { warn: () => {} } })).toThrow();
  });
});
