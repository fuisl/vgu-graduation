import Link from "next/link";
import {Section} from "@grad/ui";
import {BrandLogo} from "../logo/BrandLogo";
import {SITE_NAV} from "./nav";

/** Shared brand footer (#145): deep-blue band with the only full wordmark (owner sign-off, #153). */
export function SiteFooter() {
  return (
    <footer className="brand-footer">
      <Section tone="blue-deep" density="compact">
        <div className="brand-footer__row">
          <Link className="brand-footer__wordmark" href="/"><BrandLogo variant="full" tone="on-blue" /></Link>
          <nav aria-label="Footer">
            <ul className="brand-footer__links">
              {SITE_NAV.map((item) => (
                <li key={item.key}><a href={item.href}>{item.label}</a></li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="brand-footer__row brand-footer__meta">
          <p className="brand-footer__credit">VGU graduation · Class of 2026</p>
          {/* TODO(owner): credits link. There is no credits page yet, so this is a plain label. */}
          <p className="brand-footer__label">Grad &apos;26</p>
        </div>
      </Section>
    </footer>
  );
}
