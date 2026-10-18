import { BrandEyebrow, BrandTheme, Section } from "@grad/ui";
import { SiteFooter } from "../site/SiteFooter";
import { SiteHeader } from "../site/SiteHeader";
import "./profile.css";

export default function Loading() {
  return (
    <BrandTheme>
      <SiteHeader />
      <main className="profile-main">
        <Section tone="blue">
          <div className="profile-hero">
            <span className="profile-hero__placeholder" aria-hidden="true" />
            <div className="profile-hero__text">
              <BrandEyebrow>Guest portal</BrandEyebrow>
              <p className="profile-name" role="status">Loading your profile…</p>
            </div>
          </div>
        </Section>
      </main>
      <SiteFooter />
    </BrandTheme>
  );
}
