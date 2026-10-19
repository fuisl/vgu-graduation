import {BrandEyebrow, BrandTheme, Section} from "@grad/ui";
import {getI18n} from "../../../lib/i18n/server";
import {SiteFooter} from "../../site/SiteFooter";
import {SiteHeader} from "../../site/SiteHeader";

export const metadata = {title: "Site shell preview", robots: {index: false}};

/** Temporary, unlinked audit route for #145. Remove before merging to main (owner is auditing with it). */
export default async function SiteShellPreview() {
  const i18n = await getI18n();
  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} current="home" />
      <main id="main">
        <Section tone="blue">
          <BrandEyebrow>Preview</BrandEyebrow>
          <h1 style={{margin: "var(--space-4) 0 0", fontSize: "var(--brand-text-h1)", fontWeight: 500}}>Blue section</h1>
        </Section>
        <Section tone="white">
          <h2 style={{margin: 0, fontSize: "var(--brand-text-h2)", fontWeight: 500}}>White section</h2>
          <p>Body copy on white, then the footer.</p>
        </Section>
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
