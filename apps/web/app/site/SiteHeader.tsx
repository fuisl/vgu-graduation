import Link from "next/link";
import {Suspense, type ReactNode} from "react";
import {PillGroup, PillItem} from "@grad/ui";
import {pickMessages, type I18n} from "../../lib/i18n/dictionary";
import {BrandLogo} from "../logo/BrandLogo";
import {TextSizeControl} from "../text-size/TextSizeControl";
import {EssentialsLabel, EventEssentials, type EssentialsVariant} from "./EventEssentials";
import {MobileMenu} from "./MobileMenu";
import {GuestChip} from "./GuestChip";
import {LanguageSwitch} from "./LanguageSwitch";
import {SITE_NAV, VENUE_HREF, siteNavLinks, type SiteNavKey} from "./nav";
import {SkipLink} from "./SkipLink";
import {ThemeColorSync} from "./ThemeColorSync";
import {BRAND_THEME_COLOR} from "./theme-color";

type Props = {
  /** The page's language and translator, from `await getI18n()`. */
  i18n: I18n;
  /** Marks the active page (aria-current, white pill). `home` marks nothing. */
  current?: SiteNavKey;
  /** Right-hand slot. Defaults to the two-state guest chip (#146). */
  action?: ReactNode;
};

/** The essentials, streamed: a plain "Venue" label until GET /event answers, and if it fails. */
function Essentials({i18n, variant}: {i18n: I18n; variant: EssentialsVariant}) {
  return (
    <Suspense fallback={<EssentialsLabel i18n={i18n} variant={variant} event={null} />}>
      <EventEssentials i18n={i18n} variant={variant} />
    </Suspense>
  );
}

/**
 * Shared brand header (#145), the menubar: the single home of what every page needs (owner
 * brief, 2026-10). Desktop, left to right: the "F" mark (home); one pill group with the event
 * essentials (date and venue, linking to /venue), Camera and Wishes; then EN | VI, text size and
 * the guest chip (the guest's own entry, /me). Mobile: the mark, a one-tap Camera link and Menu,
 * which opens a sheet holding the same items. Server component; the sheet, chip, language and
 * text-size controls are the only client code. Render inside <BrandTheme>. Desktop and mobile
 * variants are both in the DOM and CSS hides the one that does not apply (display:none, so it
 * leaves the a11y tree). Before the header: the skip link (the page's first focusable element) and
 * a zero-height sentinel; ThemeColorSync watches it and fills the header once it is stuck (#78).
 */
export function SiteHeader({i18n, current, action}: Props) {
  const {t, locale} = i18n;
  const slot = action ?? <GuestChip labels={{portal: t("header.invitation"), profile: t("header.profile")}} />;
  const links = siteNavLinks(i18n);
  const language = <LanguageSwitch locale={locale} label={t("lang.label")} />;
  const textSize = <TextSizeControl variant="compact" messages={pickMessages(locale, "textSize.")} />;
  const camera = links.find((item) => item.key === SITE_NAV[0]?.key) ?? links[0];
  return (
    <>
      <SkipLink label={t("shell.skipToContent")} />
      <span className="brand-header-sentinel" aria-hidden="true" />
      <header className="brand-header">
        {/* React hoists this into <head>; ThemeColorSync then follows the section under the top edge. */}
        <meta name="theme-color" content={BRAND_THEME_COLOR} />
        <ThemeColorSync />
        <div className="brand-header__inner">
          <Link className="brand-wordmark" href="/" aria-label={t("nav.home")}>
            {/* CSS shows the one matching the band under the sticky header. */}
            <BrandLogo variant="compact" tone="on-blue" className="brand-wordmark__on-blue" alt="" />
            <BrandLogo variant="compact" tone="on-white" className="brand-wordmark__on-white" alt="" />
          </Link>
          <div className="brand-header__nav">
            <PillGroup label={t("header.navLabel")}>
              <PillItem href={VENUE_HREF} current={current === "venue"}>
                <Essentials i18n={i18n} variant="pill" />
              </PillItem>
              {links.map((item) => (
                <PillItem key={item.key} href={item.href} current={item.key === current}>{item.label}</PillItem>
              ))}
            </PillGroup>
          </div>
          <div className="brand-header__action">
            {language}
            {textSize}
            {slot}
          </div>
          <MobileMenu
            current={current}
            action={slot}
            language={language}
            textSize={textSize}
            essentials={<Essentials i18n={i18n} variant="sheet" />}
            links={links}
            quick={camera}
            labels={{
              menu: t("header.menu"),
              close: t("header.closeMenu"),
              nav: t("header.navLabel"),
              home: t("nav.home"),
              language: t("lang.label"),
              textSize: t("textSize.label"),
            }}
          />
        </div>
      </header>
    </>
  );
}
