import { backoffDelay, type BackoffOptions } from "./backoff";

/** The slice of the browser WebSocket this module uses, so tests can pass a fake. */
export interface SocketLike {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  close(code?: number, reason?: string): void;
}

export interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export type LiveSocketState =
  | { phase: "connecting"; failures: number; everOpened: boolean }
  | { phase: "open" }
  | { phase: "waiting"; failures: number; everOpened: boolean; retryInMs: number }
  | { phase: "stopped" };

export interface LiveSocketOptions {
  url: string;
  onMessage: (data: string) => void;
  /** Called on every open; `reconnect` is false only the first time. Fetch catch-up here. */
  onOpen?: (info: { reconnect: boolean }) => void;
  /** Called when an attempt ends. `opened` is false when it never connected (handshake refused, network down). */
  onClose?: (info: { opened: boolean; failures: number }) => void;
  onStateChange?: (state: LiveSocketState) => void;
  backoff?: Partial<BackoffOptions>;
  /** Reconnect when nothing arrives for this long, e.g. three missed keepalives. Off when omitted. */
  idleTimeoutMs?: number;
  /** Give up on an attempt that has not opened after this long. */
  connectTimeoutMs?: number;
  /** A connection must stay open this long before the failure count resets, so a server that accepts and drops at once still backs off. */
  stableMs?: number;
  createSocket?: (url: string) => SocketLike;
  timers?: Timers;
  random?: () => number;
  now?: () => number;
}

const defaultTimers: Timers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

/**
 * A server-to-client WebSocket that keeps itself connected: exponential backoff
 * with jitter between attempts, a connect timeout, an optional idle watchdog,
 * and nothing left behind on `stop()` (one socket and at most two timers alive
 * at any time). It never parses messages; callers validate them.
 *
 * Sockets are dropped by detaching their handlers before `close()`, so a dead
 * network that takes a minute to report the close cannot delay the retry or
 * deliver late events.
 */
export class LiveSocket {
  private socket: SocketLike | null = null;
  private retryTimer: unknown = null;
  private watchTimer: unknown = null;
  private failures = 0;
  private everOpened = false;
  private openedAt: number | null = null;
  private stopped = true;
  private readonly timers: Timers;
  private readonly now: () => number;

  constructor(private readonly options: LiveSocketOptions) {
    this.timers = options.timers ?? defaultTimers;
    this.now = options.now ?? Date.now;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearRetry();
    this.drop();
    this.emit({ phase: "stopped" });
  }

  /** Skip the remaining wait, e.g. when the browser reports it is back online. No-op while connecting or open. */
  reconnectNow(): void {
    if (this.stopped || this.retryTimer === null) return;
    this.clearRetry();
    this.connect();
  }

  /** Force a fresh connection (e.g. a tab coming back after hours). */
  restart(): void {
    if (this.stopped) return;
    this.clearRetry();
    this.drop();
    this.connect();
  }

  private connect(): void {
    this.emit({ phase: "connecting", failures: this.failures, everOpened: this.everOpened });
    let socket: SocketLike;
    try {
      socket = (this.options.createSocket ?? ((url) => new WebSocket(url) as unknown as SocketLike))(this.options.url);
    } catch {
      this.scheduleRetry(false);
      return;
    }
    this.socket = socket;
    let opened = false;

    // Handlers check identity too: a captured handler of a dropped socket must stay inert.
    const current = () => socket === this.socket;
    socket.onopen = () => {
      if (!current()) return;
      opened = true;
      this.openedAt = this.now();
      const reconnect = this.everOpened;
      this.everOpened = true;
      this.watch(this.options.idleTimeoutMs);
      this.emit({ phase: "open" });
      this.options.onOpen?.({ reconnect });
    };
    socket.onmessage = (event) => {
      if (!current()) return;
      this.watch(this.options.idleTimeoutMs);
      if (typeof event.data === "string") this.options.onMessage(event.data);
    };
    socket.onclose = () => current() && this.lost(opened);
    socket.onerror = () => current() && this.lost(opened);

    this.watch(this.options.connectTimeoutMs ?? 15_000);
  }

  /** Arms the single watchdog: on expiry the current socket is treated as lost. */
  private watch(ms: number | undefined): void {
    if (this.watchTimer !== null) this.timers.clearTimeout(this.watchTimer);
    this.watchTimer = null;
    if (!ms) return;
    const socket = this.socket;
    this.watchTimer = this.timers.setTimeout(() => {
      this.watchTimer = null;
      if (socket === this.socket) this.lost(this.openedAt !== null);
    }, ms);
  }

  private lost(opened: boolean): void {
    if (this.socket === null) return;
    const stable = opened && this.openedAt !== null && this.now() - this.openedAt >= (this.options.stableMs ?? 5_000);
    this.drop();
    if (stable) this.failures = 0;
    this.scheduleRetry(opened);
  }

  private scheduleRetry(opened: boolean): void {
    if (this.stopped) return;
    const failures = this.failures;
    this.failures += 1;
    this.options.onClose?.({ opened, failures: this.failures });
    if (this.stopped) return;
    const retryInMs = backoffDelay(failures, this.options.backoff, this.options.random);
    this.emit({ phase: "waiting", failures: this.failures, everOpened: this.everOpened, retryInMs });
    this.retryTimer = this.timers.setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, retryInMs);
  }

  private drop(): void {
    if (this.watchTimer !== null) this.timers.clearTimeout(this.watchTimer);
    this.watchTimer = null;
    this.openedAt = null;
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
    try {
      socket.close(1000);
    } catch {
      // Closing a socket that never opened can throw in some browsers; it is gone either way.
    }
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) this.timers.clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private emit(state: LiveSocketState): void {
    this.options.onStateChange?.(state);
  }
}

/** `wss://api.../live/display` from the browser-visible API origin (ADR-003: streams go browser-direct). */
export function liveSocketUrl(path: string, apiOrigin: string): string {
  const url = new URL(path, apiOrigin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
