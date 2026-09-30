import type { WebSocket } from "@fastify/websocket";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveHub } from "./live.hub.js";

class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  bufferedAmount = 0;
  sent: string[] = [];
  pings = 0;
  terminated = false;
  closed: [number, string] | undefined;
  send(data: string) {
    this.sent.push(data);
  }
  ping() {
    this.pings++;
  }
  terminate() {
    this.terminated = true;
    this.readyState = 3;
  }
  close(code: number, reason: string) {
    this.closed = [code, reason];
    this.readyState = 3;
  }
}

const asSocket = (s: FakeSocket) => s as unknown as WebSocket;

afterEach(() => vi.useRealTimers());

describe("LiveHub", () => {
  it("broadcasts one serialized message to every open socket", () => {
    const hub = new LiveHub<{ n: number }>();
    const [a, b, closed] = [new FakeSocket(), new FakeSocket(), new FakeSocket()];
    closed.readyState = 3;
    for (const s of [a, b, closed]) hub.add(asSocket(s));
    hub.broadcast({ n: 1 });
    expect(a.sent).toEqual(['{"n":1}']);
    expect(b.sent).toEqual(['{"n":1}']);
    expect(closed.sent).toEqual([]);
    hub.close();
  });

  it("reports active on the first client and idle after the last leaves", () => {
    const onActive = vi.fn();
    const onIdle = vi.fn();
    const hub = new LiveHub({ onActive, onIdle });
    const [a, b] = [new FakeSocket(), new FakeSocket()];
    hub.add(asSocket(a));
    hub.add(asSocket(b));
    expect(onActive).toHaveBeenCalledTimes(1);
    a.emit("close");
    expect(onIdle).not.toHaveBeenCalled();
    b.emit("error", new Error("reset"));
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(hub.size).toBe(0);
  });

  it("pings on an interval and drops a socket that missed its pong", () => {
    vi.useFakeTimers();
    const hub = new LiveHub({ pingIntervalMs: 1000 });
    const [live, dead] = [new FakeSocket(), new FakeSocket()];
    hub.add(asSocket(live));
    hub.add(asSocket(dead));

    vi.advanceTimersByTime(1000);
    expect([live.pings, dead.pings]).toEqual([1, 1]);
    live.emit("pong");

    vi.advanceTimersByTime(1000);
    expect(live.pings).toBe(2);
    expect(dead.terminated).toBe(true);
    expect(hub.size).toBe(1);
    hub.close();
  });

  it("drops a client whose send buffer is backed up instead of queueing forever", () => {
    const hub = new LiveHub<string>();
    const slow = new FakeSocket();
    slow.bufferedAmount = 2 * 1024 * 1024;
    hub.add(asSocket(slow));
    hub.broadcast("x");
    expect(slow.terminated).toBe(true);
    expect(slow.sent).toEqual([]);
    expect(hub.size).toBe(0);
  });

  it("closes every socket with 1001 on shutdown", () => {
    const hub = new LiveHub();
    const s = new FakeSocket();
    hub.add(asSocket(s));
    hub.close();
    expect(s.closed?.[0]).toBe(1001);
    expect(hub.size).toBe(0);
  });
});
