/**
 * Allows `limit` hits per key in a sliding `windowMs`, in memory. Per API
 * process: with N replicas a key gets up to N × limit, which is fine for
 * keeping one invitation from turning the sender into a spam relay.
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
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(now);
    return true;
  }

  /** Gives back the last hit, for a send that failed before reaching the guest. */
  refund(key: string): void {
    this.hits.get(key)?.pop();
  }

  private prune(now: number): void {
    for (const [key, times] of this.hits) {
      if (times.every((at) => now - at >= this.windowMs)) this.hits.delete(key);
    }
  }
}
