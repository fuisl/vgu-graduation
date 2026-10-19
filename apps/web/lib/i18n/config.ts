/**
 * Site languages (#9, ADR-010). English and Vietnamese, English as the fallback.
 * German is a live-caption language only (/live), never a site language.
 * Client-safe: no dictionary is imported here.
 */
export const LOCALES = ["en", "vi"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** The guest's explicit choice, set by POST /api/locale. Not a credential, so not HttpOnly-sensitive. */
export const LOCALE_COOKIE = "lang";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** BCP 47 tags for `Intl`: en-GB keeps the existing "Friday 20 November" and 24-hour clock. */
export const INTL_LOCALE: Record<Locale, string> = { en: "en-GB", vi: "vi-VN" };

/** The language's own name, for the switcher's accessible names (always in that language). */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", vi: "Tiếng Việt" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * The first supported language in an Accept-Language header, by quality: any `vi*`
 * tag is Vietnamese, any `en*` English; otherwise null. Malformed parts are skipped.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .slice(0, 32)
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((entry) => entry.tag && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  for (const { tag } of ranked) {
    const primary = tag.split("-")[0];
    if (isLocale(primary)) return primary;
  }
  return null;
}

/** Cookie first (the guest's choice), then the browser's Accept-Language, then English. Pure. */
export function resolveLocale({ cookie, acceptLanguage }: { cookie?: string | null; acceptLanguage?: string | null }): Locale {
  if (isLocale(cookie)) return cookie;
  return localeFromAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE;
}
