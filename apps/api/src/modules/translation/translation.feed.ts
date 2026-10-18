import type {
  LiveTranslationMessage,
  LiveTranslationSegmentsResponse,
  TargetLanguage,
  TranslationSegment,
  TranslationState,
} from "@grad/contract";
import type { WebSocket } from "@fastify/websocket";
import type { FastifyBaseLogger } from "fastify";
import { LiveHub } from "../live/live.hub.js";
import type { SegmentChange, TranslationStore } from "./translation.repository.js";

/** Stop writing to a socket that has this much queued; it reconnects and catches up. Same as LiveHub. */
const MAX_BUFFERED_BYTES = 1024 * 1024;

export interface TranslationFeedOptions {
  /** Concurrent `WS /live/translation` sockets across every language. */
  maxClients?: number;
  /** Segments kept in memory for the on-connect snapshot and cheap catch-up. */
  recentLimit?: number;
  /** Segments sent on connect. */
  snapshotLimit?: number;
  /** How often `keepalive` goes out (and availability is re-checked) while anyone listens. */
  keepaliveMs?: number;
  /** Protocol ping interval for listeners (LiveHub). */
  pingIntervalMs?: number;
  /** A segment this recent counts as "live" even without an ingest connection (e.g. a mock provider). */
  liveWindowMs?: number;
  /**
   * How far catch-up looks back behind `since`. A change is stamped with its
   * transaction's start, so one can commit just after a watermark that is
   * already later; the overlap catches it. Clients apply results idempotently.
   */
  overlapMs?: number;
}

type Channel = TargetLanguage | "all";

/** Only the caption language a client asked for; the source text always stays. */
export function forLanguage(segment: TranslationSegment, lang: TargetLanguage | undefined): TranslationSegment {
  if (!lang) return segment;
  return { ...segment, translations: segment.translations.filter((t) => t.language === lang) };
}

const keyOf = (s: TranslationSegment) => `${s.sessionId}\u0000${s.sequence}`;

/**
 * Live translation fan-out (#68). Every segment the translation service posts
 * goes through `publish`, so this process sees every change: it keeps the most
 * recent segments in memory (bounded), answers the on-connect snapshot and
 * most catch-up requests from there, and broadcasts each change to
 * `WS /live/translation` listeners (one hub per caption language, each
 * message serialized once) and to the display. Single replica, like LiveHub.
 *
 * Availability: `live` while a capture client is streaming to a connected
 * translation service, or while segments keep arriving; otherwise
 * `unavailable`, so the page can say so.
 */
export class TranslationFeed {
  private readonly hubs = new Map<Channel, LiveHub<LiveTranslationMessage>>();
  /** Recent segments keyed by (sessionId, sequence), in order of latest change. */
  private readonly recentSegments = new Map<string, SegmentChange>();
  /** Memory holds every change after this (DB clock); older `since` values go to the database. */
  private coveredFrom: Date | undefined;
  /** Latest database time this process has seen: what `until` reports. */
  private watermark: Date | undefined;
  private priming: Promise<void> | undefined;
  private lastPrimeAttempt = 0;

  private ingestLive = false;
  private lastSegmentAt = Number.NEGATIVE_INFINITY;
  private lastState: TranslationState = "unavailable";
  private keepaliveTimer: NodeJS.Timeout | undefined;

  private readonly maxClients: number;
  private readonly recentLimit: number;
  private readonly snapshotLimit: number;
  private readonly keepaliveMs: number;
  private readonly liveWindowMs: number;
  private readonly overlapMs: number;

  constructor(
    private readonly store: TranslationStore,
    private readonly log: Pick<FastifyBaseLogger, "warn" | "error">,
    options: TranslationFeedOptions = {},
    /** Extra destinations for every change, e.g. the event display. */
    private readonly sinks: Array<(segment: TranslationSegment) => void> = [],
  ) {
    this.maxClients = options.maxClients ?? 1000;
    this.recentLimit = options.recentLimit ?? 200;
    this.snapshotLimit = Math.min(options.snapshotLimit ?? 50, this.recentLimit);
    this.keepaliveMs = options.keepaliveMs ?? 25_000;
    this.liveWindowMs = options.liveWindowMs ?? 60_000;
    this.overlapMs = options.overlapMs ?? 5_000;
    for (const channel of ["all", "de", "en", "vi"] as const) {
      this.hubs.set(
        channel,
        new LiveHub<LiveTranslationMessage>({
          pingIntervalMs: options.pingIntervalMs,
          onActive: () => this.startKeepalive(),
          onIdle: () => this.stopKeepaliveIfIdle(),
        }),
      );
    }
  }

  get clientCount(): number {
    let n = 0;
    for (const hub of this.hubs.values()) n += hub.size;
    return n;
  }

  /** True when one more listener would exceed the connection limit. */
  get full(): boolean {
    return this.clientCount >= this.maxClients;
  }

  get state(): TranslationState {
    return this.ingestLive || Date.now() - this.lastSegmentAt < this.liveWindowMs ? "live" : "unavailable";
  }

  /** Loads the newest segments from the database (first listener or catch-up, retried later if it was down). */
  prime(): Promise<void> {
    if (this.coveredFrom) return Promise.resolve();
    if (this.priming) return this.priming;
    this.lastPrimeAttempt = Date.now();
    this.priming = (async () => {
      try {
        const now = await this.store.now();
        const rows = await this.store.recent(this.recentLimit);
        // Changes published while priming are newer than what the query read: keep them.
        const merged = new Map<string, SegmentChange>();
        for (const row of rows) {
          if (!this.recentSegments.has(keyOf(row.segment))) merged.set(keyOf(row.segment), row);
        }
        for (const [key, row] of this.recentSegments) merged.set(key, row);
        this.recentSegments.clear();
        for (const [key, row] of [...merged].sort((a, b) => a[1].changedAt.getTime() - b[1].changedAt.getTime())) {
          this.recentSegments.set(key, row);
        }
        // A full page means older segments exist that memory doesn't hold.
        this.coveredFrom = rows.length < this.recentLimit ? new Date(0) : rows[0].changedAt;
        this.trim();
        this.advance(now);
      } catch (err) {
        this.log.error({ err }, "translation feed: could not load recent segments");
      } finally {
        this.priming = undefined;
      }
    })();
    return this.priming;
  }

  /** Stores nothing: called after the store accepted a change, with what it returned. */
  publish(change: SegmentChange): void {
    const key = keyOf(change.segment);
    // Re-insert so map order stays "latest change last", which is what eviction relies on.
    this.recentSegments.delete(key);
    this.recentSegments.set(key, change);
    this.trim();
    this.advance(change.changedAt);
    this.lastSegmentAt = Date.now();
    // A first segment flips listeners to `live` before it arrives.
    this.checkState();

    const until = this.watermark?.toISOString();
    for (const [channel, hub] of this.hubs) {
      if (hub.size === 0) continue;
      const segment = forLanguage(change.segment, channel === "all" ? undefined : channel);
      hub.broadcast({ type: "segment", segment, until });
    }
    for (const sink of this.sinks) sink(change.segment);
  }

  /** Ingest pipeline state, from the ingest proxy: capture client connected and upstream open. */
  setIngestLive(live: boolean): void {
    this.ingestLive = live;
    this.checkState();
  }

  /**
   * Adds a listener and sends it the status and the recent segments before any
   * live update. Synchronous from `add` to the last snapshot message, so
   * nothing published in between can be missed or arrive out of order. The
   * first listener after a restart waits for memory to load (or fail to).
   */
  async subscribe(socket: WebSocket, lang: TargetLanguage | undefined): Promise<void> {
    await this.ensurePrimed();
    if (socket.readyState !== socket.OPEN) return;
    // Checked again here: handshakes that passed the route's check together can't all fit.
    if (this.full) {
      socket.close(1013, "try again later");
      return;
    }
    const until = this.watermark?.toISOString();
    const snapshot = [...this.recentSegments.values()].slice(-this.snapshotLimit);
    this.hubs.get(lang ?? "all")!.add(socket);
    this.sendTo(socket, { type: "status", state: this.state, until });
    for (const change of snapshot) {
      if (!this.sendTo(socket, { type: "segment", segment: forLanguage(change.segment, lang), until })) return;
    }
  }

  /** GET /live/translation/segments. From memory when it covers `since`, else from the database. */
  async catchUp(since: Date | undefined, lang: TargetLanguage | undefined, limit: number): Promise<LiveTranslationSegmentsResponse> {
    await this.ensurePrimed();
    const from = since ? new Date(since.getTime() - this.overlapMs) : undefined;

    let rows: SegmentChange[];
    let until: Date;
    if (this.watermark && this.memoryCovers(from, limit)) {
      const all = [...this.recentSegments.values()];
      rows = from === undefined ? all.slice(-limit) : all.filter((r) => r.changedAt > from).slice(0, limit + 1);
      until = this.watermark;
    } else {
      const now = await this.store.now();
      rows = from === undefined ? await this.store.recent(limit) : await this.store.changesSince(from, limit + 1);
      until = now;
      this.advance(now);
    }

    // With `since`, one extra row tells whether the page was cut short.
    const more = from !== undefined && rows.length > limit;
    if (more) {
      rows = rows.slice(0, limit);
      until = rows[rows.length - 1].changedAt;
    }
    return {
      segments: rows.map((r) => forLanguage(r.segment, lang)),
      until: until.toISOString(),
      more,
      state: this.state,
    };
  }

  /** Closes every listener (server shutdown). */
  close(): void {
    for (const hub of this.hubs.values()) hub.close();
    clearInterval(this.keepaliveTimer);
    this.keepaliveTimer = undefined;
  }

  /** Loads memory on first use; while the database is down, retries at most every 5 s. */
  private async ensurePrimed(): Promise<void> {
    if (this.coveredFrom) return;
    if (this.priming) return this.priming;
    if (Date.now() - this.lastPrimeAttempt < 5_000) return;
    return this.prime();
  }

  /** Whether memory alone answers a catch-up: every change after `from`, or the newest `limit` segments. */
  private memoryCovers(from: Date | undefined, limit: number): boolean {
    if (!this.coveredFrom) return false;
    if (from !== undefined) return from >= this.coveredFrom;
    return this.recentSegments.size >= limit || this.coveredFrom.getTime() === 0;
  }

  private sendTo(socket: WebSocket, message: LiveTranslationMessage): boolean {
    if (socket.readyState !== socket.OPEN) return false;
    if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      socket.terminate();
      return false;
    }
    socket.send(JSON.stringify(message));
    return true;
  }

  private broadcastAll(message: LiveTranslationMessage): void {
    for (const hub of this.hubs.values()) if (hub.size > 0) hub.broadcast(message);
  }

  private checkState(): void {
    const state = this.state;
    if (state === this.lastState) return;
    this.lastState = state;
    this.broadcastAll({ type: "status", state, until: this.watermark?.toISOString() });
  }

  private advance(at: Date): void {
    if (!this.watermark || at > this.watermark) this.watermark = at;
  }

  /** Evicts the least recently changed segments; memory then covers only what is newer than them. */
  private trim(): void {
    while (this.recentSegments.size > this.recentLimit) {
      const [key, oldest] = this.recentSegments.entries().next().value!;
      this.recentSegments.delete(key);
      if (this.coveredFrom && oldest.changedAt > this.coveredFrom) this.coveredFrom = oldest.changedAt;
    }
  }

  private startKeepalive(): void {
    if (this.keepaliveTimer) return;
    this.keepaliveTimer = setInterval(() => {
      this.checkState();
      this.broadcastAll({ type: "keepalive", until: this.watermark?.toISOString() });
    }, this.keepaliveMs);
    this.keepaliveTimer.unref();
  }

  private stopKeepaliveIfIdle(): void {
    if (this.clientCount > 0) return;
    clearInterval(this.keepaliveTimer);
    this.keepaliveTimer = undefined;
  }
}
