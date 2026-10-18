/** "about 45 minutes", "about an hour", "about 2 hours", "a minute": a Retry-After for people. */
export function formatRetryAfter(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes === 1) return "a minute";
  if (minutes < 55) return `about ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours <= 1 ? "about an hour" : `about ${hours} hours`;
}

/** What the guest reads when POST /api/print fails, by status. Never echoes server detail. */
export function printErrorMessage(status: number, retryAfterSeconds: number | undefined, perHour: number): string {
  switch (status) {
    case 401:
    case 404:
    case 410:
      return "We couldn't confirm your invitation. Open your invitation link again, then request the print.";
    case 403:
      return "Printing isn't available right now.";
    case 409:
      return "This photo can't be printed. It may have been hidden or is still being processed.";
    case 429:
      return `You've reached the limit of ${perHour} prints an hour. Try again in ${formatRetryAfter(retryAfterSeconds ?? 3600)}.`;
    default:
      return "The print queue couldn't be reached. Check your connection and try again.";
  }
}
