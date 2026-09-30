import { BrandEyebrow, BrandTheme, Cta, Section } from "@grad/ui";
import { SiteFooter } from "../../site/SiteFooter";
import { SiteHeader } from "../../site/SiteHeader";
import "../invite.css";

export default function Demo() {
  return (
    <BrandTheme>
      <SiteHeader />
      <main className="invite-main">
        <Section tone="blue" aria-labelledby="demo-heading">
          <BrandEyebrow>PERSONAL INVITATION / PREVIEW</BrandEyebrow>
          <h1 id="demo-heading" className="invite-title invite-title--display">
            You are
            <br />
            invited.
          </h1>
        </Section>
        <Section tone="white" density="compact" narrow>
          <div className="invite-body">
            <p>
              Design-system smoke test. Personalized guest data and RSVP behavior belong to the invitation
              vertical-slice PR.
            </p>
          </div>
          <div className="invite-actions">
            <Cta tone="on-white" href="/">Back home</Cta>
          </div>
        </Section>
      </main>
      <SiteFooter />
    </BrandTheme>
  );
}
