import { cookies, headers } from "next/headers";
import { cache } from "react";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "./config";
import { createI18n, type I18n } from "./dictionary";

/**
 * The request's site language (#9, ADR-010): the `lang` cookie, else Accept-Language, else
 * English. There is no locale in the URL, so invitation links never change. Reading the cookie
 * makes a page render per request; API data stays in the fetch cache (tags and revalidate), so
 * only the HTML is rendered per locale and nothing cached can carry the other language.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  return resolveLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerList.get("accept-language"),
  });
});

/** Locale, Intl tag and translator for a server component, page, metadata or server action. */
export const getI18n = cache(async (): Promise<I18n> => createI18n(await getLocale()));
