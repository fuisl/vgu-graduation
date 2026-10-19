type SchedulerLike = { yield?: () => Promise<void> };

/**
 * Hands the main thread back to the browser (input, paint) and resumes in a later task (#78).
 * `scheduler.yield()` where supported, so the continuation keeps its place in line; a zero
 * timeout elsewhere (Safari, Firefox).
 */
export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: SchedulerLike }).scheduler;
  if (typeof scheduler?.yield === "function") return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}
