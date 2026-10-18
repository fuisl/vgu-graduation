import { BrandEyebrow, BrandTheme, Section } from "@grad/ui";
import { SiteFooter } from "../site/SiteFooter";
import { SiteHeader } from "../site/SiteHeader";
import "../me/profile.css";
import "./guide.css";

export default function Loading() {
  return (
    <BrandTheme>
      <SiteHeader />
      <main className="profile-main">
        <Section tone="blue">
          <div className="guide-hero">
            <BrandEyebrow>Guide-book</BrandEyebrow>
            <p className="profile-name" role="status">Loading your guide-book…</p>
          </div>
        </Section>
      </main>
      <SiteFooter />
    </BrandTheme>
  );
}
