/**
 * Last-known-good copies of personal API reads (QA P0-1).
 *
 * Personal reads (GET /invitations/me, GET /invitations/me/guide) are `no-store`: the Next fetch
 * cache keeps serving a stale entry whenever revalidation fails, and it only stores successes, so
 * a revoked, rotated or expired invitation kept working there indefinitely. Venue resilience still
 * matters, so the last good answer per token is kept here, in process memory only, and used only
 * when the API is unreachable or answers 5xx. A definitive refusal (401, 403, 404, 410) deletes it,
 * and so does an admin revoke or rotate in this process.
 *
 * Keys are the token's SHA-256 hash, never the token. Entries expire after `ttlMs` and the store
 * holds at most `maxEntries` (oldest dropped first), so an outage cannot pin stale personal data
 * forever. Nothing here is logged.
 */

interface Entry<T> {
  value: T;
  storedAt: number;
}

export interface LastKnownGoodOptions {
  maxEntries: number;
  ttlMs: number;
}

/** Six hours: long enough to ride out an API restart or a bad venue uplink, short enough to age out. */
export const LAST_KNOWN_GOOD_TTL_MS = 6 * 60 * 60 * 1000;
/** Comfortably above the guest list; bounds memory if tokens are sprayed at the BFF. */
export const LAST_KNOWN_GOOD_MAX_ENTRIES = 2000;

export class LastKnownGood<T> {
  private readonly entries = new Map<string, Entry<T>>();

  constructor(private readonly options: LastKnownGoodOptions) {}

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (now - entry.storedAt > this.options.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, now = Date.now()): void {
    // Re-insert so Map order stays oldest-first for eviction.
    this.entries.delete(key);
    this.entries.set(key, { value, storedAt: now });
    while (this.entries.size > this.options.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  /** Deletes every entry whose value matches; returns their keys. */
  deleteWhere(matches: (value: T) => boolean): string[] {
    const keys: string[] = [];
    for (const [key, entry] of this.entries) {
      if (matches(entry.value)) keys.push(key);
    }
    for (const key of keys) this.entries.delete(key);
    return keys;
  }

  clear(): void {
    this.entries.clear();
  }
}

const REGISTRY = Symbol.for("grad26.lastKnownGood");
type Registry = Map<string, LastKnownGood<unknown>>;

/**
 * The named store, kept on `globalThis` so every route and server-action bundle in this server
 * process shares one copy (an admin revoke must reach the store the guest pages read).
 */
export function lastKnownGoodStore<T>(name: string): LastKnownGood<T> {
  const holder = globalThis as typeof globalThis & { [REGISTRY]?: Registry };
  const registry = (holder[REGISTRY] ??= new Map());
  let store = registry.get(name);
  if (!store) {
    store = new LastKnownGood<unknown>({ maxEntries: LAST_KNOWN_GOOD_MAX_ENTRIES, ttlMs: LAST_KNOWN_GOOD_TTL_MS });
    registry.set(name, store);
  }
  return store as LastKnownGood<T>;
}

/** The API's definitive answer about a credential: the stored copy must go and must never be served. */
export function isCredentialRefusal(status: number): boolean {
  return status === 401 || status === 403 || status === 404 || status === 410;
}

/** Only an outage may fall back: a network error (no status) or a 5xx. */
export function mayUseLastKnownGood(status: number | undefined): boolean {
  return status === undefined || status >= 500;
}

/** Test helper: empties every store. */
export function resetLastKnownGood(): void {
  const holder = globalThis as typeof globalThis & { [REGISTRY]?: Registry };
  for (const store of holder[REGISTRY]?.values() ?? []) store.clear();
}
