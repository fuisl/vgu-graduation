import Link from "next/link";
import type {ReactNode} from "react";
import {PillGroup, PillItem} from "@grad/ui";
import {BrandLogo} from "../logo/BrandLogo";
import {MobileMenu} from "./MobileMenu";
import {GuestChip} from "./GuestChip";
import {SITE_NAV, type SiteNavKey} from "./nav";
import {ThemeColorSync} from "./ThemeColorSync";
import {BRAND_THEME_COLOR} from "./theme-color";

type Props = {
  /** Marks the active page (aria-current, white pill). */
  current?: SiteNavKey;
  /** Right-hand slot. Defaults to the two-state guest chip (#146). */
  action?: ReactNode;
};

/**
 * Shared brand header (#145). Shows only the compact "F" mark; the full wordmark lives in the footer. Server component; only the mobile sheet is client code.
 * Render inside <BrandTheme>. Desktop and mobile variants are both in the DOM and
 * CSS hides the one that does not apply (display:none, so it leaves the a11y tree).
 */
export function SiteHeader({current, action}: Props) {
  const slot = action ?? <GuestChip />;
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
          <PillGroup label="Main">
            {SITE_NAV.map((item) => (
              <PillItem key={item.key} href={item.href} current={item.key === current}>{item.label}</PillItem>
            ))}
          </PillGroup>
        </div>
        <div className="brand-header__action">{slot}</div>
        <MobileMenu current={current} action={slot} />
      </div>
    </header>
  );
}
