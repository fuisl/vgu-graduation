import Link from "next/link";
import type {ReactNode} from "react";
import {PillGroup, PillItem} from "@grad/ui";
import type {I18n} from "../../lib/i18n/dictionary";
import {BrandLogo} from "../logo/BrandLogo";
import {MobileMenu} from "./MobileMenu";
import {GuestChip} from "./GuestChip";
import {LanguageSwitch} from "./LanguageSwitch";
import {siteNavLinks, type SiteNavKey} from "./nav";
import {ThemeColorSync} from "./ThemeColorSync";
import {BRAND_THEME_COLOR} from "./theme-color";

type Props = {
  /** The page's language and translator, from `await getI18n()`. */
  i18n: I18n;
  /** Marks the active page (aria-current, white pill). */
  current?: SiteNavKey;
  /** Right-hand slot. Defaults to the two-state guest chip (#146). */
  action?: ReactNode;
};

/**
 * Shared brand header (#145). Shows only the compact "F" mark; the full wordmark lives in the footer. Server component; only the mobile sheet is client code.
 * Render inside <BrandTheme>. Desktop and mobile variants are both in the DOM and
 * CSS hides the one that does not apply (display:none, so it leaves the a11y tree).
 * The EN | VI switch (#9) sits before the guest chip on desktop and in the mobile sheet.
 */
export function SiteHeader({i18n, current, action}: Props) {
  const {t, locale} = i18n;
  const slot = action ?? <GuestChip labels={{portal: t("header.guestPortal"), profile: t("header.profile")}} />;
  const links = siteNavLinks(i18n);
  const language = <LanguageSwitch locale={locale} label={t("lang.label")} />;
  return (
    <header className="brand-header">
      {/* React hoists this into <head>; ThemeColorSync then follows the section under the top edge. */}
      <meta name="theme-color" content={BRAND_THEME_COLOR} />
      <ThemeColorSync />
      <div className="brand-header__inner">
        <Link className="brand-wordmark" href="/">
          {/* CSS shows the one matching the band under the sticky header. */}
          <BrandLogo variant="compact" tone="on-blue" className="brand-wordmark__on-blue" />
          <BrandLogo variant="compact" tone="on-white" className="brand-wordmark__on-white" />
        </Link>
        <div className="brand-header__nav">
          <PillGroup label={t("header.navLabel")}>
            {links.map((item) => (
              <PillItem key={item.key} href={item.href} current={item.key === current}>{item.label}</PillItem>
            ))}
          </PillGroup>
        </div>
        <div className="brand-header__action">
          {language}
          {slot}
        </div>
        <MobileMenu
          current={current}
          action={slot}
          language={language}
          links={links}
          labels={{menu: t("header.menu"), close: t("header.closeMenu"), nav: t("header.navLabel")}}
        />
      </div>
    </header>
  );
}
