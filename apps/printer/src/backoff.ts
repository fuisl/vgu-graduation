/**
 * Exponential backoff with full jitter: the n-th consecutive failure waits a
 * random time in [0, min(max, base * 2^n)]. Reset after any success.
 */
export class Backoff {
  private failures = 0;

  constructor(
    private readonly baseMs: number,
    private readonly maxMs: number,
    private readonly random: () => number = Math.random,
  ) {}

  /** Delay before the next attempt; counts one more failure. */
  next(): number {
    const ceiling = Math.min(this.maxMs, this.baseMs * 2 ** this.failures);
    this.failures = Math.min(this.failures + 1, 30);
    return Math.round(ceiling * this.random());
  }

  reset() {
    this.failures = 0;
  }

  get attempts() {
    return this.failures;
  }
}
