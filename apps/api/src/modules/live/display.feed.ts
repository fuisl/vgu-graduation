import type { LiveDisplayFeedResponse, LiveDisplayMessage } from "@grad/contract";
import type { FastifyBaseLogger } from "fastify";
import type { DisplaySource } from "./display.repository.js";
import type { LiveHub } from "./live.hub.js";

export interface DisplayFeedOptions {
  /** How often the database is polled while at least one display is connected. */
  pollMs?: number;
  /** How often a `keepalive` message goes out, so a kiosk can tell a dead socket from a quiet one. */
  keepaliveMs?: number;
  /**
   * How far every query looks back behind its cursor. `updated_at` is the
   * writing transaction's start time, so a row can commit a moment after a
   * poll has passed its timestamp; the overlap catches it on the next poll.
   */
  overlapMs?: number;
  /** Items in a snapshot (catch-up without `since`), per kind. */
  snapshotLimit?: number;
}

/**
 * Live display feed (#65). Polls the database for wishes and photos whose
 * `updated_at` moved and broadcasts them to `WS /live/display`; the same reads
 * answer the HTTP catch-up. Polling reads only committed rows, so it does not
 * depend on how (or from which process: api or worker) a row was written.
 */
export class DisplayFeed {
  private readonly pollMs: number;
  private readonly keepaliveMs: number;
  private readonly overlapMs: number;
  private readonly snapshotLimit: number;

  private running = false;
  /** Bumped on every start, so a poll still in flight from before a stop/start can't fork a second loop. */
  private generation = 0;
  private timer: NodeJS.Timeout | undefined;
  private cursor: Date | undefined;
  private lastKeepalive = Date.now();
  /** key -> version already broadcast, so the overlap window never repeats a message. */
  private readonly sent = new Map<string, { version: string; updatedAt: number }>();

  constructor(
    private readonly source: DisplaySource,
    private readonly hub: Pick<LiveHub<LiveDisplayMessage>, "broadcast">,
    private readonly log: Pick<FastifyBaseLogger, "error">,
    options: DisplayFeedOptions = {},
  ) {
    this.pollMs = options.pollMs ?? 2_000;
    this.keepaliveMs = options.keepaliveMs ?? 25_000;
    this.overlapMs = options.overlapMs ?? 5_000;
    this.snapshotLimit = options.snapshotLimit ?? 100;
  }

  /** Starts polling (first display connected). Idempotent. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.generation++;
    this.cursor = undefined;
    this.sent.clear();
    this.lastKeepalive = Date.now();
    this.schedule(0);
  }

  /** Stops polling (last display left, or shutdown). */
  stop(): void {
    this.running = false;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** One poll: broadcast what changed since the cursor, then a keepalive if one is due. Exposed for tests. */
  async poll(): Promise<void> {
    const now = await this.source.now();
    // First poll after start: the client's catch-up covers everything before now.
    const from = this.cursor ?? now;
    const changes = await this.source.changesSince(new Date(from.getTime() - this.overlapMs));
    for (const change of changes) {
      if (this.sent.get(change.key)?.version === change.version) continue;
      this.sent.set(change.key, { version: change.version, updatedAt: change.updatedAt.getTime() });
      this.hub.broadcast(change.message);
    }
    this.cursor = now;

    // Forget entries the next query can no longer return.
    const horizon = now.getTime() - 2 * this.overlapMs;
    for (const [key, entry] of this.sent) if (entry.updatedAt < horizon) this.sent.delete(key);

    if (Date.now() - this.lastKeepalive >= this.keepaliveMs) {
      this.lastKeepalive = Date.now();
      this.hub.broadcast({ type: "keepalive", until: now.toISOString() });
    }
  }

  /** GET /live/display/feed: the current state, or every change after `since`. */
  async catchUp(since?: Date): Promise<LiveDisplayFeedResponse> {
    const until = await this.source.now();
    const messages = since
      ? (await this.source.changesSince(new Date(since.getTime() - this.overlapMs))).map((c) => c.message)
      : await this.source.snapshot(this.snapshotLimit);
    return { messages, until: until.toISOString() };
  }

  private schedule(delay: number): void {
    const generation = this.generation;
    this.timer = setTimeout(async () => {
      if (!this.running || generation !== this.generation) return;
      try {
        await this.poll();
      } catch (err) {
        // A failed poll (database blip) is retried next tick; the cursor did not move.
        this.log.error({ err }, "display feed poll failed");
      }
      if (this.running && generation === this.generation) this.schedule(this.pollMs);
    }, delay);
    this.timer.unref();
  }
}
