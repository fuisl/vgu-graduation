import {BrandEyebrow, BrandTheme, Section} from "@grad/ui";
import {SiteFooter} from "../../site/SiteFooter";
import {SiteHeader} from "../../site/SiteHeader";

export const metadata = {title: "Site shell preview", robots: {index: false}};

/** Temporary, unlinked audit route for #145. Removed in #155. */
export default function SiteShellPreview() {
  return (
    <BrandTheme>
      <SiteHeader current="home" />
      <main>
        <Section tone="blue">
          <BrandEyebrow>Preview</BrandEyebrow>
          <h1 style={{margin: "var(--space-4) 0 0", fontSize: "var(--brand-text-h1)", fontWeight: 500}}>Blue section</h1>
        </Section>
        <Section tone="white">
          <h2 style={{margin: 0, fontSize: "var(--brand-text-h2)", fontWeight: 500}}>White section</h2>
          <p>Body copy on white, then the footer.</p>
        </Section>
      </main>
      <SiteFooter />
    </BrandTheme>
  );
}
