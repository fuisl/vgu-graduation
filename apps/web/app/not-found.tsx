import { BrandEyebrow, BrandTheme, Cta, Section } from "@grad/ui";
import { SiteFooter } from "./site/SiteFooter";
import { SiteHeader } from "./site/SiteHeader";
import "./not-found.css";

export default function NotFound() {
  return (
    <BrandTheme>
      <SiteHeader />
      <main>
        <Section tone="blue" aria-labelledby="notfound-title">
          <div className="notfound">
            <BrandEyebrow>Error 404</BrandEyebrow>
            <h1 id="notfound-title" className="notfound-title">Page not found</h1>
            <p className="notfound-text">This page wandered off before the ceremony started.</p>
            <Cta tone="on-blue" href="/">Back to home</Cta>
          </div>
        </Section>
      </main>
      <SiteFooter />
    </BrandTheme>
  );
}
