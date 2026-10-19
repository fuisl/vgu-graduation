import type { GalleryItem as ApiPhoto, LiveGalleryFeedResponse, LiveGalleryMessage, Wish } from "@grad/contract";
import { isLiveGalleryFeedResponse, isLiveGalleryMessage, laterTimestamp } from "./guards";
import { LiveSocket, liveSocketUrl, type LiveSocketState, type SocketLike, type Timers } from "./live-socket";

/**
 * The live gallery (ADR-014): `/gallery` and the guest's own pages follow
 * `WS /live/gallery`, so a wish or photo shows up for everyone within about a
 * second of being posted. Pure state here, the connection below, the React
 * hook in `use-live-gallery.ts`.
 */

/** What a page holds. Bounded, so a tab left open all evening never grows. */
export const LIVE_GALLERY_LIMITS = { wishes: 150, photos: 150 } as const;

export interface LiveGalleryState {
  /** Newest first, unique by id. */
  wishes: Wish[];
  /** Newest first, unique by publicId. */
  photos: ApiPhoto[];
  /** Server time to pass as `since` on the next catch-up. */
  until: string | null;
  /** True once a full snapshot from the feed has been applied; until then the page shows the BFF's first paint. */
  synced: boolean;
}

export const EMPTY_LIVE_GALLERY: LiveGalleryState = { wishes: [], photos: [], until: null, synced: false };

function newestFirst<T extends { createdAt: string }>(a: T, b: T): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

function upsert<T extends { createdAt: string }>(list: readonly T[], item: T, id: (t: T) => string, max: number): T[] {
  const key = id(item);
  const next = list.filter((t) => id(t) !== key);
  next.push(item);
  next.sort(newestFirst);
  return next.length > max ? next.slice(0, max) : next;
}

/** Applies one feed message, idempotently by id (catch-up can repeat what the socket sent). */
export function applyGalleryMessage(state: LiveGalleryState, message: LiveGalleryMessage): LiveGalleryState {
  switch (message.type) {
    case "wish":
      return { ...state, wishes: upsert(state.wishes, message.wish, (w) => w.id, LIVE_GALLERY_LIMITS.wishes) };
    case "photo":
      return { ...state, photos: upsert(state.photos, message.photo, (p) => p.publicId, LIVE_GALLERY_LIMITS.photos) };
    case "hidden":
      return message.kind === "wish"
        ? { ...state, wishes: state.wishes.filter((w) => w.id !== message.id) }
        : { ...state, photos: state.photos.filter((p) => p.publicId !== message.id) };
    case "keepalive":
      return { ...state, until: laterTimestamp(state.until, message.until) };
  }
}

/**
 * Applies a catch-up. A snapshot (asked for without `since`) replaces what the
 * page holds, so anything taken down while the page was away disappears; a
 * diff (with `since`) is merged on top.
 */
export function applyGalleryFeed(state: LiveGalleryState, response: LiveGalleryFeedResponse, snapshot: boolean): LiveGalleryState {
  let next: LiveGalleryState = snapshot ? { ...EMPTY_LIVE_GALLERY, until: state.until } : state;
  for (const message of response.messages) next = applyGalleryMessage(next, message);
  return { ...next, until: laterTimestamp(next.until, response.until), synced: state.synced || snapshot };
}

/** Parses one socket frame; anything malformed or unknown is dropped, never thrown. */
export function parseGalleryMessage(data: string): LiveGalleryMessage | null {
  try {
    const message: unknown = JSON.parse(data);
    return isLiveGalleryMessage(message) ? message : null;
  } catch {
    return null;
  }
}

/**
 * Connection state for the page: `live` (socket open), `polling` (no socket,
 * but the catch-up answers: updates every few seconds), `connecting`, or
 * `offline` (nothing answers; what is on screen stays).
 */
export type LiveGalleryLink = "connecting" | "live" | "polling" | "offline";

export interface LiveGalleryOptions {
  apiOrigin: string;
  /** Pass the state's `until` once synced, else null (ask for a snapshot). */
  cursor: () => string | null;
  onMessage: (message: LiveGalleryMessage) => void;
  onFeed: (response: LiveGalleryFeedResponse, snapshot: boolean) => void;
  onLink?: (link: LiveGalleryLink) => void;
  /** How often the catch-up is polled while the socket is not open. */
  pollMs?: number;
  fetch?: typeof fetch;
  createSocket?: (url: string) => SocketLike;
  timers?: Timers;
  random?: () => number;
  isOnline?: () => boolean;
}

const defaultTimers: Timers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

/**
 * Keeps a page in step with the live gallery through poor venue networks:
 *
 * - the socket reconnects with backoff and jitter (`LiveSocket`), and a quiet
 *   one is dropped after three missed keepalives;
 * - every (re)open fetches the catch-up (`since` = last cursor), so nothing
 *   missed while disconnected is lost; the socket opens first, so nothing
 *   falls between the two;
 * - while the socket is not open (blocked WebSockets, the API's connection
 *   cap, a flapping network) the catch-up is polled every `pollMs`, and the
 *   polling stops as soon as a socket opens.
 *
 * At most one socket, one request and three timers are alive at once.
 */
export class LiveGallery {
  private readonly socket: LiveSocket;
  private readonly timers: Timers;
  private readonly pollMs: number;
  private pollTimer: unknown = null;
  private request: AbortController | null = null;
  private socketState: LiveSocketState = { phase: "stopped" };
  private feedOk = false;
  private feedFailures = 0;
  private stopped = true;
  private link: LiveGalleryLink | null = null;

  constructor(private readonly options: LiveGalleryOptions) {
    this.timers = options.timers ?? defaultTimers;
    this.pollMs = options.pollMs ?? 5_000;
    this.socket = new LiveSocket({
      url: liveSocketUrl("/live/gallery", options.apiOrigin),
      // Keepalives arrive about every 25 s; nearly three missed means the socket is dead.
      idleTimeoutMs: 70_000,
      onMessage: (data) => {
        const message = parseGalleryMessage(data);
        if (message) options.onMessage(message);
      },
      onOpen: () => void this.catchUp(),
      onClose: ({ opened }) => {
        // A refused or failed attempt probes over HTTP at once instead of waiting for the poll.
        if (!opened) void this.catchUp();
      },
      onStateChange: (state) => {
        this.socketState = state;
        this.emitLink();
      },
      createSocket: options.createSocket,
      timers: options.timers,
      random: options.random,
    });
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.socket.start();
    this.schedulePoll();
  }

  stop(): void {
    this.stopped = true;
    this.socket.stop();
    this.request?.abort();
    this.request = null;
    if (this.pollTimer !== null) this.timers.clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  /** The browser is back online or the tab is visible again: retry now and catch up. */
  refresh(): void {
    if (this.stopped) return;
    this.socket.reconnectNow();
    void this.catchUp();
  }

  /** One catch-up: a snapshot before the first sync, a diff after. Exposed for tests. */
  async catchUp(): Promise<void> {
    if (this.stopped) return;
    this.request?.abort();
    const controller = new AbortController();
    this.request = controller;
    const since = this.options.cursor();
    const url = new URL("/live/gallery/feed", this.options.apiOrigin);
    if (since) url.searchParams.set("since", since);
    try {
      const response = await (this.options.fetch ?? fetch)(url.toString(), {
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body: unknown = await response.json();
      if (!isLiveGalleryFeedResponse(body)) throw new Error("invalid feed");
      if (this.stopped || this.request !== controller) return;
      this.feedOk = true;
      this.feedFailures = 0;
      this.options.onFeed(body, !since);
    } catch {
      if (controller.signal.aborted) return;
      this.feedOk = false;
      this.feedFailures += 1;
    } finally {
      if (this.request === controller) this.request = null;
      this.emitLink();
    }
  }

  private schedulePoll(): void {
    if (this.stopped) return;
    this.pollTimer = this.timers.setTimeout(() => {
      this.pollTimer = null;
      if (this.socketState.phase !== "open" && this.request === null) void this.catchUp();
      this.schedulePoll();
    }, this.pollMs);
  }

  private emitLink(): void {
    const next = this.computeLink();
    if (next === this.link) return;
    this.link = next;
    this.options.onLink?.(next);
  }

  private computeLink(): LiveGalleryLink {
    const state = this.socketState;
    if (state.phase === "open") return "live";
    if (this.feedOk) return "polling";
    const offline = this.options.isOnline ? !this.options.isOnline() : typeof navigator !== "undefined" && navigator.onLine === false;
    const socketFailures = state.phase === "connecting" || state.phase === "waiting" ? state.failures : 0;
    if (offline || this.feedFailures >= 2 || socketFailures >= 3) return "offline";
    return "connecting";
  }
}
