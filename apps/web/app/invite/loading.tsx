import { BrandEyebrow, BrandTheme, Section } from "@grad/ui";
import { SiteFooter } from "../site/SiteFooter";
import { SiteHeader } from "../site/SiteHeader";
import "./invite.css";

export default function Loading() {
  return (
    <BrandTheme>
      <SiteHeader />
      <main className="invite-main">
        <Section tone="blue">
          <BrandEyebrow>Your invitation</BrandEyebrow>
          <p className="invite-title" role="status">Loading your invitation…</p>
        </Section>
      </main>
      <SiteFooter />
    </BrandTheme>
  );
}
