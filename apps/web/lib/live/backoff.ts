export interface BackoffOptions {
  /** Delay cap for the first retry. */
  baseMs: number;
  /** Upper bound, however many attempts have failed. */
  maxMs: number;
  /** Lower bound, so a flapping server is never hammered. */
  minMs: number;
}

export const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 1_000, maxMs: 30_000, minMs: 500 };

/**
 * Exponential backoff with full jitter: a uniform delay between `minMs` and
 * min(maxMs, baseMs * 2^attempt). Jitter matters on the day: when the API
 * restarts, hundreds of phones and the kiosk all lose the socket at once, and
 * spreading their retries keeps them from arriving as one burst.
 * `attempt` counts consecutive failures, starting at 0.
 */
export function backoffDelay(
  attempt: number,
  options: Partial<BackoffOptions> = {},
  random: () => number = Math.random,
): number {
  const { baseMs, maxMs, minMs } = { ...DEFAULT_BACKOFF, ...options };
  const exponent = Math.min(Math.max(0, Math.floor(attempt)), 30);
  const cap = Math.max(minMs, Math.min(maxMs, baseMs * 2 ** exponent));
  const r = Math.min(Math.max(random(), 0), 1);
  return Math.round(minMs + r * (cap - minMs));
}
