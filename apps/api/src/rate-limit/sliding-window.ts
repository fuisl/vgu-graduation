/**
 * Allows `limit` hits per key in a sliding `windowMs`, in memory. Per API
 * process: with N replicas a key gets up to N × limit. The API runs as a single
 * replica (docs/development/local-development.md, "Rate limits"), so today a
 * limit is exact; it is a brake on abuse, not an accounting system.
 *
 * Keys are kept in memory only and never logged (they may be client IPs or
 * email addresses).
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a hit and returns true, or returns false without recording when the key is over the limit. */
  take(key: string): boolean {
    const now = this.now();
    const recent = this.recent(key, now);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(now);
    return true;
  }

  /**
   * Whole seconds until `key` may take again (at least 1), for a `Retry-After`
   * header after `take` returned false; 0 when it may take now.
   */
  retryAfterSeconds(key: string): number {
    const now = this.now();
    const recent = this.recent(key, now);
    if (recent.length < this.limit) return 0;
    // The hit that has to age out before one more fits.
    const blocking = recent[recent.length - this.limit]!;
    return Math.max(1, Math.ceil((blocking + this.windowMs - now) / 1000));
  }

  /** Gives back the last hit, for a send that failed before reaching the guest. */
  refund(key: string): void {
    this.hits.get(key)?.pop();
  }

  private recent(key: string, now: number): number[] {
    return (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs);
  }

  private prune(now: number): void {
    for (const [key, times] of this.hits) {
      if (times.every((at) => now - at >= this.windowMs)) this.hits.delete(key);
    }
  }
}
