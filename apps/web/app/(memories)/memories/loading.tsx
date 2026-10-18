import { BrandEyebrow, BrandTheme, Section } from "@grad/ui";
import { SiteFooter } from "../../site/SiteFooter";
import { SiteHeader } from "../../site/SiteHeader";
import "./archive.css";

/** Shown while /memories or its timeline renders on a slow connection (both are usually served from cache). */
export default function Loading() {
  return (
    <BrandTheme>
      <SiteHeader />
      <main>
        <Section tone="blue">
          <div className="mem-hero">
            <BrandEyebrow ellipsis>Archive</BrandEyebrow>
            <p className="mem-title" role="status">Loading memories…</p>
          </div>
        </Section>
      </main>
      <SiteFooter />
    </BrandTheme>
  );
}
