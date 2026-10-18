import type { LiveTranslationMessage, TargetLanguage, TranslationSegment } from "@grad/contract";
import { isLiveTranslationMessage, isTargetLanguage, isTranslationBacklog } from "./guards";
import type { LiveSocketState } from "./live-socket";

export function parseTranslationMessage(data: string): LiveTranslationMessage | null {
  try {
    const message: unknown = JSON.parse(data);
    return isLiveTranslationMessage(message) ? message : null;
  } catch {
    return null;
  }
}

export function parseBacklog(body: unknown): TranslationSegment[] | null {
  return isTranslationBacklog(body) ? body.segments : null;
}

/** `GET /live/translation/segments?sessionId=&after=` (contract `translationBacklogQuerySchema`). */
export function backlogUrl(apiOrigin: string, sessionId: string, after: number): string {
  const url = new URL("/live/translation/segments", apiOrigin);
  url.searchParams.set("sessionId", sessionId);
  url.searchParams.set("after", String(after));
  return url.toString();
}

export type TranslationView = "connecting" | "live" | "reconnecting" | "unavailable";

/** Attempts in a row that never open before the page says the service is absent rather than "connecting". */
export const UNAVAILABLE_AFTER_FAILURES = 3;

/**
 * What the page says about the service. `unavailable` covers both the API
 * saying so (translation pod suspended) and a socket that cannot be reached
 * at all (route absent, API down); the page keeps retrying underneath.
 */
export function translationView(socket: LiveSocketState, service: "unknown" | "live" | "unavailable"): TranslationView {
  if (socket.phase === "open") return service === "unavailable" ? "unavailable" : "live";
  if (socket.phase === "stopped") return "connecting";
  if (service === "unavailable") return "unavailable";
  if (!socket.everOpened && socket.failures >= UNAVAILABLE_AFTER_FAILURES) return "unavailable";
  if (socket.everOpened && socket.failures >= UNAVAILABLE_AFTER_FAILURES * 2) return "unavailable";
  return socket.everOpened ? "reconnecting" : "connecting";
}

export const LANGUAGES: ReadonlyArray<{ code: TargetLanguage; label: string; name: string }> = [
  { code: "de", label: "DE", name: "Deutsch" },
  { code: "en", label: "EN", name: "English" },
  { code: "vi", label: "VI", name: "Tiếng Việt" },
];

export const TEXT_SIZES = ["m", "l", "xl"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

/** First supported language in the browser's list, else English. */
export function defaultLanguage(preferred: readonly string[]): TargetLanguage {
  for (const tag of preferred) {
    const code = tag.toLowerCase().split("-")[0];
    if (isTargetLanguage(code)) return code;
  }
  return "en";
}

export function parseLanguage(value: string | null): TargetLanguage | null {
  return isTargetLanguage(value) ? value : null;
}

export function parseTextSize(value: string | null): TextSize | null {
  return (TEXT_SIZES as readonly string[]).includes(value ?? "") ? (value as TextSize) : null;
}

/** localStorage that never throws (private mode, blocked storage, quota). */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Preference just isn't remembered.
    }
  },
};

/**
 * Batches final captions for a screen-reader live region: at most one
 * announcement per `intervalMs`, capped at `maxChars` (oldest text dropped),
 * so a fast speaker cannot flood the queue. Each segment is announced once.
 */
export class AnnouncementQueue {
  private pending: { key: string; text: string }[] = [];
  private announced = new Set<string>();
  private lastAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly intervalMs = 5_000, private readonly maxChars = 280, private readonly memory = 400) {}

  push(key: string, text: string): void {
    if (this.announced.has(key) || this.pending.some((p) => p.key === key)) return;
    this.pending.push({ key, text });
  }

  /** The text to announce now, or null (nothing pending, or too soon). */
  take(now: number): string | null {
    if (this.pending.length === 0 || now - this.lastAt < this.intervalMs) return null;
    const parts: string[] = [];
    let length = 0;
    for (let i = this.pending.length - 1; i >= 0; i -= 1) {
      const text = this.pending[i]!.text;
      if (parts.length > 0 && length + text.length > this.maxChars) break;
      parts.unshift(text);
      length += text.length + 1;
    }
    for (const p of this.pending) this.announced.add(p.key);
    if (this.announced.size > this.memory) this.announced = new Set([...this.announced].slice(-this.memory / 2));
    this.pending = [];
    this.lastAt = now;
    return parts.join(" ");
  }

  /** Forget pending text, e.g. after switching language. */
  clear(): void {
    this.pending = [];
  }

  /** Delay until `take` can return something, for scheduling one timer. */
  waitMs(now: number): number {
    return Math.max(0, this.intervalMs - (now - this.lastAt));
  }

  get hasPending(): boolean {
    return this.pending.length > 0;
  }
}
