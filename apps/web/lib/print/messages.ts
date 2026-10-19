import type { MessageKeys, SliceTranslator } from "../i18n/format";

/** The `print.*` messages, in the guest's language (#9); the gallery passes its translator. */
type T = SliceTranslator<MessageKeys<"print.">>;

/** "about 45 minutes", "about an hour", "about 2 hours", "a minute": a Retry-After for people. */
export function formatRetryAfter(seconds: number, t: T): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes === 1) return t("print.wait.minute");
  if (minutes < 55) return t("print.wait.minutes", { count: minutes });
  const hours = Math.round(minutes / 60);
  return hours <= 1 ? t("print.wait.hour") : t("print.wait.hours", { count: hours });
}

/** What the guest reads when POST /api/print fails, by status. Never echoes server detail. */
export function printErrorMessage(status: number, retryAfterSeconds: number | undefined, perHour: number, t: T): string {
  switch (status) {
    case 401:
    case 404:
    case 410:
      return t("print.error.invitation");
    case 403:
      return t("print.error.disabled");
    case 409:
      return t("print.error.photo");
    case 429:
      return t("print.error.limit", { perHour, wait: formatRetryAfter(retryAfterSeconds ?? 3600, t) });
    default:
      return t("print.error.network");
  }
}
