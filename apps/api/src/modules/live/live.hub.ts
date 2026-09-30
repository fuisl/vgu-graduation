import type { WebSocket } from "@fastify/websocket";

/** A socket the server stops writing to once this much is queued: a stuck client is dropped and catches up on reconnect. */
const MAX_BUFFERED_BYTES = 1024 * 1024;

export interface LiveHubOptions {
  /**
   * Protocol-level ping interval. Keeps idle proxies (Traefik, NAT, venue Wi-Fi)
   * from dropping a quiet socket, and terminates any socket that missed the
   * previous pong.
   */
  pingIntervalMs?: number;
  /** Called when the first client joins, e.g. to start polling. */
  onActive?: () => void;
  /** Called when the last client leaves. */
  onIdle?: () => void;
}

/**
 * Fan-out for one server-to-client channel (`WS /live/display` today,
 * `WS /live/translation` later). Clients only listen; anything they send is
 * ignored. Single replica: every connected socket lives in this process.
 */
export class LiveHub<M> {
  private readonly sockets = new Map<WebSocket, { alive: boolean }>();
  private pingTimer: NodeJS.Timeout | undefined;
  private readonly pingIntervalMs: number;

  constructor(private readonly options: LiveHubOptions = {}) {
    this.pingIntervalMs = options.pingIntervalMs ?? 25_000;
  }

  get size(): number {
    return this.sockets.size;
  }

  add(socket: WebSocket): void {
    const state = { alive: true };
    this.sockets.set(socket, state);
    socket.on("pong", () => {
      state.alive = true;
    });
    socket.on("close", () => this.remove(socket));
    socket.on("error", () => this.remove(socket));

    if (this.sockets.size === 1) {
      this.pingTimer = setInterval(() => this.ping(), this.pingIntervalMs);
      this.pingTimer.unref();
      this.options.onActive?.();
    }
  }

  /** Sends one message to every open socket. Serialized once. */
  broadcast(message: M): void {
    const data = JSON.stringify(message);
    for (const socket of this.sockets.keys()) {
      if (socket.readyState !== socket.OPEN) continue;
      if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
        socket.terminate();
        this.remove(socket);
        continue;
      }
      socket.send(data);
    }
  }

  /** Closes every socket (server shutdown). Clients reconnect to the next process. */
  close(): void {
    for (const socket of [...this.sockets.keys()]) {
      socket.close(1001, "server shutting down");
      this.remove(socket);
    }
  }

  private remove(socket: WebSocket): void {
    if (!this.sockets.delete(socket)) return;
    if (this.sockets.size === 0) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
      this.options.onIdle?.();
    }
  }

  private ping(): void {
    for (const [socket, state] of [...this.sockets]) {
      if (!state.alive) {
        socket.terminate();
        this.remove(socket);
        continue;
      }
      state.alive = false;
      socket.ping();
    }
  }
}
