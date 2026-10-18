import { INGEST_MAX_FRAME_BYTES, ingestControlMessageSchema, type IngestStatusMessage } from "@grad/contract";
import type { FastifyBaseLogger } from "fastify";
import WebSocket, { type RawData } from "ws";

/** Largest JSON control message relayed either way. */
const MAX_TEXT_BYTES = 4 * 1024;
/** Largest frame accepted from the translation service; it only sends small JSON, larger text is not relayed. */
const MAX_UPSTREAM_PAYLOAD = 64 * 1024;

/** Close code sent to a capture client when a newer one takes over. */
export const CLOSE_REPLACED = 4001;

export interface IngestProxyOptions {
  /** Translation service's audio WebSocket. Unset: ingest accepts the capture client but reports unavailable. */
  upstreamUrl?: string;
  /** Sent as `Authorization: Bearer` to the translation service, so it can check the caller is the API. */
  upstreamToken?: string;
  /**
   * Upstream send buffer above which audio frames are dropped instead of
   * queued. 256 KiB is about 8 s of audio: past that, captions would lag the
   * speaker so far that newer audio matters more than old.
   */
  maxUpstreamBufferedBytes?: number;
  /** First and largest delay between upstream reconnect attempts (doubles each failure). */
  reconnectMinMs?: number;
  reconnectMaxMs?: number;
  /** Protocol ping interval for both sockets; a socket that missed the previous pong is dropped. */
  pingIntervalMs?: number;
  /** Upstream handshake timeout. */
  connectTimeoutMs?: number;
  /** Called with true while a capture client streams to a connected upstream. */
  onLiveChange?: (live: boolean) => void;
}

/**
 * `WS /live/ingest` (ADR-007): relays the venue capture client's audio to the
 * translation service over the cluster network. One capture client at a time:
 * a new connection takes over and the previous one is closed with 4001, so a
 * laptop that dropped off Wi-Fi can reconnect at once instead of waiting for
 * its half-open socket to time out.
 *
 * The upstream socket exists only while a capture client is connected and is
 * re-dialled with backoff when it fails. Audio is never queued beyond a small
 * send buffer: while the translation service is absent, suspended or backed
 * up, frames are dropped and counted, and nothing else in the API notices.
 * Audio content is never logged.
 */
export class IngestProxy {
  private capture: WebSocket | undefined;
  private captureAlive = true;
  private upstream: WebSocket | undefined;
  private upstreamOpen = false;
  private upstreamAlive = true;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private reconnectDelay: number;
  private pingTimer: NodeJS.Timeout | undefined;
  /** Last `start` control message, replayed to every new upstream before audio. */
  private startMessage: string | undefined;
  private droppedFrames = 0;
  private dropping = false;
  private live = false;

  private readonly maxUpstreamBufferedBytes: number;
  private readonly reconnectMinMs: number;
  private readonly reconnectMaxMs: number;
  private readonly pingIntervalMs: number;
  private readonly connectTimeoutMs: number;

  constructor(
    private readonly log: Pick<FastifyBaseLogger, "info" | "warn">,
    private readonly options: IngestProxyOptions = {},
  ) {
    this.maxUpstreamBufferedBytes = options.maxUpstreamBufferedBytes ?? 256 * 1024;
    this.reconnectMinMs = options.reconnectMinMs ?? 500;
    this.reconnectMaxMs = options.reconnectMaxMs ?? 10_000;
    this.pingIntervalMs = options.pingIntervalMs ?? 15_000;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 5_000;
    this.reconnectDelay = this.reconnectMinMs;
  }

  /** Whether a capture client is connected and its audio reaches the translation service. */
  get isLive(): boolean {
    return this.live;
  }

  get hasCapture(): boolean {
    return this.capture !== undefined;
  }

  /** Takes a newly authenticated capture client, replacing any current one. */
  attach(socket: WebSocket): void {
    if (this.capture) {
      this.log.info("translation ingest: a new capture client took over");
      const previous = this.capture;
      this.detach();
      previous.close(CLOSE_REPLACED, "replaced by a newer ingest connection");
    }
    this.capture = socket;
    this.captureAlive = true;
    this.droppedFrames = 0;
    this.dropping = false;
    this.startMessage = undefined;
    this.log.info("translation ingest: capture client connected");

    socket.on("message", (data, isBinary) => {
      if (this.capture === socket) this.fromCapture(data, isBinary);
    });
    socket.on("pong", () => {
      if (this.capture === socket) this.captureAlive = true;
    });
    const gone = () => {
      if (this.capture !== socket) return;
      this.log.info({ droppedFrames: this.droppedFrames }, "translation ingest: capture client disconnected");
      this.detach();
    };
    socket.on("close", gone);
    socket.on("error", gone);

    this.pingTimer = setInterval(() => this.ping(), this.pingIntervalMs);
    this.pingTimer.unref();
    this.sendStatus();
    this.connectUpstream();
  }

  /** Server shutdown: the capture client reconnects to the next process. */
  close(): void {
    const capture = this.capture;
    this.detach();
    capture?.close(1001, "server shutting down");
  }

  private detach(): void {
    this.capture = undefined;
    clearInterval(this.pingTimer);
    this.pingTimer = undefined;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.reconnectDelay = this.reconnectMinMs;
    const upstream = this.upstream;
    this.upstream = undefined;
    this.upstreamOpen = false;
    if (upstream) {
      upstream.removeAllListeners();
      upstream.on("error", () => {});
      if (upstream.readyState === WebSocket.OPEN) upstream.close(1000, "capture client left");
      else upstream.terminate();
    }
    this.updateLive();
  }

  private fromCapture(data: RawData, isBinary: boolean): void {
    const buffer = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
    if (isBinary) {
      // Whole s16le samples only; the WebSocket server already caps the size.
      if (buffer.length === 0 || buffer.length % 2 !== 0 || buffer.length > INGEST_MAX_FRAME_BYTES) {
        this.drop();
        return;
      }
      const upstream = this.upstream;
      if (!upstream || !this.upstreamOpen || upstream.bufferedAmount > this.maxUpstreamBufferedBytes) {
        this.drop();
        return;
      }
      if (this.dropping) {
        this.dropping = false;
        this.log.info({ droppedFrames: this.droppedFrames }, "translation ingest: audio flowing again");
      }
      upstream.send(buffer, { binary: true });
      return;
    }

    if (buffer.length > MAX_TEXT_BYTES) return;
    const text = buffer.toString("utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    // Any JSON object with a `type` is relayed, so the capture client and the
    // service can agree on more control messages without an API change.
    if (typeof parsed !== "object" || parsed === null || typeof (parsed as { type?: unknown }).type !== "string") return;
    const control = ingestControlMessageSchema.safeParse(parsed);
    if (control.success && control.data.type === "start") this.startMessage = text;
    if (this.upstream && this.upstreamOpen) this.upstream.send(text);
  }

  private drop(): void {
    this.droppedFrames++;
    if (!this.dropping) {
      this.dropping = true;
      this.log.warn("translation ingest: dropping audio (translation service unavailable or backed up)");
    }
  }

  private connectUpstream(): void {
    if (!this.capture || this.upstream) return;
    const url = this.options.upstreamUrl;
    if (!url) return;

    const headers: Record<string, string> = {};
    if (this.options.upstreamToken) headers.authorization = `Bearer ${this.options.upstreamToken}`;
    const upstream = new WebSocket(url, { headers, handshakeTimeout: this.connectTimeoutMs, maxPayload: MAX_UPSTREAM_PAYLOAD });
    this.upstream = upstream;
    this.upstreamOpen = false;
    this.upstreamAlive = true;

    upstream.on("open", () => {
      if (this.upstream !== upstream) return;
      this.upstreamOpen = true;
      this.reconnectDelay = this.reconnectMinMs;
      this.log.info("translation ingest: connected to the translation service");
      if (this.startMessage) upstream.send(this.startMessage);
      this.updateLive();
      this.sendStatus();
    });
    upstream.on("message", (data, isBinary) => {
      if (this.upstream !== upstream || isBinary) return;
      // Relay the service's JSON (e.g. readiness) to the capture client.
      const capture = this.capture;
      const text = data.toString();
      if (capture?.readyState === WebSocket.OPEN && Buffer.byteLength(text) <= MAX_TEXT_BYTES) capture.send(text);
    });
    upstream.on("pong", () => {
      if (this.upstream === upstream) this.upstreamAlive = true;
    });
    const lost = () => {
      if (this.upstream !== upstream) return;
      const wasOpen = this.upstreamOpen;
      this.upstream = undefined;
      this.upstreamOpen = false;
      upstream.removeAllListeners();
      upstream.on("error", () => {});
      upstream.terminate();
      if (wasOpen) this.log.warn("translation ingest: lost the translation service, reconnecting");
      this.updateLive();
      if (wasOpen) this.sendStatus();
      this.scheduleReconnect();
    };
    upstream.on("close", lost);
    upstream.on("error", lost);
  }

  private scheduleReconnect(): void {
    if (!this.capture || this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.reconnectMaxMs);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connectUpstream();
    }, delay);
    this.reconnectTimer.unref();
  }

  private ping(): void {
    const capture = this.capture;
    if (capture) {
      if (!this.captureAlive) {
        this.log.info("translation ingest: capture client missed a ping");
        this.detach();
        capture.terminate();
        return;
      }
      this.captureAlive = false;
      capture.ping();
    }
    const upstream = this.upstream;
    if (upstream && this.upstreamOpen) {
      if (!this.upstreamAlive) {
        // Its "close" event then runs the reconnect path.
        upstream.terminate();
        return;
      }
      this.upstreamAlive = false;
      upstream.ping();
    }
  }

  private sendStatus(): void {
    const capture = this.capture;
    if (capture?.readyState !== WebSocket.OPEN) return;
    const message: IngestStatusMessage = {
      type: "status",
      upstream: this.upstreamOpen ? "connected" : "unavailable",
      droppedFrames: this.droppedFrames,
    };
    capture.send(JSON.stringify(message));
  }

  private updateLive(): void {
    const live = this.capture !== undefined && this.upstreamOpen;
    if (live === this.live) return;
    this.live = live;
    this.options.onLiveChange?.(live);
  }
}
