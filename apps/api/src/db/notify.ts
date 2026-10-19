import pg from "pg";

/**
 * Postgres NOTIFY channels (ADR-014). Triggers raise them (migration
 * 0008_live_notify), so no writer has to remember to. Payloads carry only a
 * table name, never row data, tokens or guest PII.
 *
 * - `grad_live`: a wish or photo row was inserted or updated (api or worker).
 *   The live feed polls at once instead of waiting for its next tick.
 * - `grad_jobs`: a job was queued. The worker claims it at once instead of
 *   sleeping out its idle interval.
 */
export const LIVE_CHANNEL = "grad_live";
export const JOBS_CHANNEL = "grad_jobs";

/**
 * A wake-up hint, never the source of truth: whoever listens still reads the
 * committed rows itself and keeps its own polling fallback, so a lost
 * notification (listener reconnecting, database restart) only costs latency.
 */
export interface ChangeNotifier {
  /** Starts listening. `onReconnect` runs when a dropped connection is back, since notifications may have been missed. */
  start(handlers: { onNotify: () => void; onReconnect?: () => void }): void;
  /** Stops listening and closes the connection. Safe to call when stopped. */
  stop(): Promise<void>;
}

/** The slice of `pg.Client` the listener uses, so tests can pass a fake. */
export interface ListenClient {
  connect(): Promise<unknown>;
  query(sql: string): Promise<unknown>;
  end(): Promise<unknown>;
  on(event: "notification", cb: (message: { channel: string }) => void): unknown;
  on(event: "error" | "end", cb: (err?: unknown) => void): unknown;
  removeAllListeners(): unknown;
}

export interface PgListenerOptions {
  connectionString: string;
  channel: string;
  log: { warn(fields: Record<string, unknown>, message: string): void };
  /** First retry delay after a failed or dropped connection; doubles up to `maxRetryMs`. */
  minRetryMs?: number;
  maxRetryMs?: number;
  createClient?: (connectionString: string) => ListenClient;
}

const CHANNEL_NAME = /^[a-z_][a-z0-9_]*$/;

/**
 * One dedicated connection (LISTEN needs a session, so it never comes from the
 * pool) that stays subscribed to one channel: it reconnects with exponential
 * backoff after any error and never throws into the process. Logs carry only an
 * error code, never the connection string.
 */
export class PgListener implements ChangeNotifier {
  private client: ListenClient | null = null;
  private retryTimer: NodeJS.Timeout | undefined;
  private failures = 0;
  private everConnected = false;
  private stopped = true;
  private handlers: { onNotify: () => void; onReconnect?: () => void } = { onNotify: () => {} };
  private readonly minRetryMs: number;
  private readonly maxRetryMs: number;
  private readonly createClient: (connectionString: string) => ListenClient;

  constructor(private readonly options: PgListenerOptions) {
    if (!CHANNEL_NAME.test(options.channel)) throw new Error("invalid channel name");
    this.minRetryMs = options.minRetryMs ?? 1_000;
    this.maxRetryMs = options.maxRetryMs ?? 30_000;
    this.createClient =
      options.createClient ??
      ((connectionString) => new pg.Client({ connectionString, keepAlive: true }) as unknown as ListenClient);
  }

  start(handlers: { onNotify: () => void; onReconnect?: () => void }): void {
    this.handlers = handlers;
    if (!this.stopped) return;
    this.stopped = false;
    this.everConnected = false;
    this.failures = 0;
    void this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    const client = this.client;
    this.client = null;
    if (client) await this.dispose(client);
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    const client = this.createClient(this.options.connectionString);
    this.client = client;
    client.on("notification", (message) => {
      if (this.client === client && message.channel === this.options.channel) this.handlers.onNotify();
    });
    client.on("error", (err) => this.lost(client, err));
    client.on("end", () => this.lost(client));
    try {
      await client.connect();
      // The channel is a validated constant identifier, never user input.
      await client.query(`LISTEN ${this.options.channel}`);
    } catch (err) {
      this.lost(client, err);
      return;
    }
    if (this.client !== client) return;
    const reconnect = this.everConnected;
    this.everConnected = true;
    this.failures = 0;
    if (reconnect) this.handlers.onReconnect?.();
  }

  private lost(client: ListenClient, err?: unknown): void {
    if (this.client !== client) return;
    this.client = null;
    const code = (err as { code?: string } | undefined)?.code;
    this.options.log.warn({ channel: this.options.channel, code: code ?? "closed" }, "database listener lost; retrying");
    void this.dispose(client);
    if (this.stopped) return;
    const delay = Math.min(this.maxRetryMs, this.minRetryMs * 2 ** Math.min(this.failures, 10));
    this.failures += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.connect();
    }, delay);
    this.retryTimer.unref();
  }

  private async dispose(client: ListenClient): Promise<void> {
    client.removeAllListeners();
    // A late socket error after we let go must not crash the process.
    client.on("error", () => {});
    try {
      await client.end();
    } catch {
      // Already closed.
    }
  }
}
