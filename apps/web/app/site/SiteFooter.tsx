import Link from "next/link";
import {Section} from "@grad/ui";
import type {I18n} from "../../lib/i18n/dictionary";
import {BrandLogo} from "../logo/BrandLogo";
import {LanguageSwitch} from "./LanguageSwitch";
import {siteNavLinks} from "./nav";

/**
 * Shared brand footer (#145): deep-blue band with the only full wordmark (owner sign-off, #153).
 * The EN | VI switch (#9) sits in the meta row; it is the one that works on a phone without JavaScript.
 */
export function SiteFooter({i18n}: {i18n: I18n}) {
  const {t, locale} = i18n;
  return (
    <footer className="brand-footer">
      <Section tone="blue-deep" density="compact">
        <div className="brand-footer__row">
          <Link className="brand-footer__wordmark" href="/"><BrandLogo variant="full" tone="on-blue" /></Link>
          <nav aria-label={t("footer.navLabel")}>
            <ul className="brand-footer__links">
              {siteNavLinks(i18n).map((item) => (
                <li key={item.key}><a href={item.href}>{item.label}</a></li>
              ))}
              {/* The curated archive (#75, #76): footer only, so the header keeps its four links. */}
              <li><a href="/memories">{t("footer.memories")}</a></li>
            </ul>
          </nav>
        </div>
        <div className="brand-footer__row brand-footer__meta">
          <p className="brand-footer__credit">
            {t("footer.credit")} · <a className="brand-footer__about" href="/about">{t("footer.credits")}</a>
            {" · "}
            <a className="brand-footer__about" href="/accessibility">{t("footer.accessibility")}</a>
          </p>
          <div className="brand-footer__end">
            <LanguageSwitch locale={locale} label={t("lang.label")} />
            <p className="brand-footer__label">Grad &apos;26</p>
          </div>
        </div>
      </Section>
    </footer>
  );
}
