import Link from "next/link";
import {Container} from "@grad/ui";
import {BrandLogo} from "../logo/BrandLogo";
import {SITE_NAV} from "./nav";

/**
 * Shared brand footer (#145), white tone.
 * PROPOSAL pending owner decision (brief open question 4): content (wordmark,
 * four links, credit line, mono label) and white-vs-blue tone are not final.
 */
export function SiteFooter() {
  return (
    <footer className="brand-footer">
      <Container>
        <div className="brand-footer__row">
          <Link className="brand-footer__wordmark" href="/"><BrandLogo variant="full" tone="on-white" /></Link>
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
          <p className="brand-footer__label">Grad &apos;26</p>
        </div>
      </Container>
    </footer>
  );
}
