import Link from "next/link";
import {Section} from "@grad/ui";
import type {I18n} from "../../lib/i18n/dictionary";
import {BrandLogo} from "../logo/BrandLogo";
import {LanguageSwitch} from "./LanguageSwitch";

/**
 * Shared brand footer (#145): a minimal deep-blue band with the only full wordmark (owner sign-off,
 * #153). It does not repeat the menubar (owner brief, 2026-10): it holds only what the header does
 * not, the curated archive, accessibility and credits, plus the credit line. The EN | VI switch
 * stays here because it is a plain form: on a phone without JavaScript (the Menu sheet needs it)
 * it is the one way to change the language.
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
              {/* The curated archive (#75, #76): footer only. */}
              <li><a href="/memories">{t("footer.memories")}</a></li>
              <li><a href="/accessibility">{t("footer.accessibility")}</a></li>
              <li><a href="/about">{t("footer.credits")}</a></li>
            </ul>
          </nav>
        </div>
        <div className="brand-footer__row brand-footer__meta">
          <p className="brand-footer__credit">{t("footer.credit")}</p>
          <LanguageSwitch locale={locale} label={t("lang.label")} />
        </div>
      </Section>
    </footer>
  );
}
