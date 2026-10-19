"use client";

import { usePathname } from "next/navigation";
import { LOCALES, LOCALE_NAMES, type Locale } from "../../lib/i18n/config";

/**
 * EN | VI switch (#9): a small mono pill in the header, the mobile sheet and the footer. A plain
 * form POST to /api/locale, so it works before or without JavaScript; the server sets the `lang`
 * cookie and redirects back here. `next` is the path only (server-rendered by usePathname), so a
 * query string or token never travels. Each option is named in its own language (`lang`), and the
 * current one carries aria-current. Only client code: usePathname.
 */
export function LanguageSwitch({ locale, label, className }: { locale: Locale; label: string; className?: string }) {
  const pathname = usePathname();
  return (
    <form className={["brand-lang", className].filter(Boolean).join(" ")} method="post" action="/api/locale">
      <input type="hidden" name="next" value={pathname || "/"} />
      <div className="brand-lang__group" role="group" aria-label={label}>
        {LOCALES.map((code) => (
          <button
            key={code}
            type="submit"
            name="lang"
            value={code}
            className="brand-lang__option"
            lang={code}
            aria-label={LOCALE_NAMES[code]}
            aria-current={code === locale ? "true" : undefined}
          >
            {code.toUpperCase()}
          </button>
        ))}
      </div>
    </form>
  );
}
