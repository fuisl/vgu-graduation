import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { BrandEyebrow, BrandTheme, Cta, Section } from "@grad/ui";
import { SiteFooter } from "../site/SiteFooter";
import { SiteHeader } from "../site/SiteHeader";
import { PortraitReveal } from "./PortraitReveal";
import { PORTRAIT_COLS, PORTRAITS } from "./portraits.generated";
import { SOURCE_URL, TEAM, githubUrl } from "./team";
import "./about.css";

export const metadata: Metadata = {
  title: "About · GRAD '26",
  description: "The developers who built the GRAD '26 graduation companion.",
};

/**
 * About and credits (#7): who built the site, as ASCII portraits that print once on scroll-in.
 * Fully static; the only client code is PortraitReveal. Linked from the footer, not the header
 * nav, which keeps its four event links (docs/design/landing.md, About page).
 */
export default function AboutPage() {
  const grid = { "--portrait-cols": PORTRAIT_COLS } as CSSProperties;

  return (
    <BrandTheme>
      <SiteHeader />
      <main className="about-main">
        <Section tone="blue" aria-labelledby="about-heading">
          <BrandEyebrow ellipsis>About</BrandEyebrow>
          <h1 id="about-heading" className="about-title">The people behind Grad ’26</h1>
          <p className="about-lead">
            Four developers built this companion for the VGU class of 2026: the invitations, the venue guide, the
            gallery and the wishes, and a few experiments around them.
          </p>
        </Section>

        <Section tone="white" aria-labelledby="team-heading">
          <BrandEyebrow>The team</BrandEyebrow>
          <h2 id="team-heading" className="about-h2">Who cooked this</h2>
          <ul className="about-team" style={grid}>
            {TEAM.map((dev) => (
              <li key={dev.handle} className="about-dev">
                <div className="about-portrait" aria-hidden="true">
                  <p className="about-portrait__prompt">$ cat {dev.handle}.txt</p>
                  <PortraitReveal>
                    <pre className="about-portrait__art">{PORTRAITS[dev.handle] ?? ""}</pre>
                  </PortraitReveal>
                </div>
                <h3 className="about-dev__handle">
                  <a href={githubUrl(dev.handle)} target="_blank" rel="noopener noreferrer">
                    @{dev.handle}
                    <span className="brand-sr-only"> on GitHub (opens in a new tab)</span>
                  </a>
                </h3>
                <p className="about-dev__roles">{dev.roles.join(" · ")}</p>
                <p className="about-dev__bio">{dev.bio}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section tone="blue" aria-labelledby="source-heading">
          <BrandEyebrow>Source</BrandEyebrow>
          <h2 id="source-heading" className="about-h2">Built in the open</h2>
          <p className="about-lead">
            Next.js and TypeScript on the web, a Node API on PostgreSQL, Python for the live translation, all in one
            repository with its handbook. Portraits are drawn from each developer&apos;s GitHub avatar with the same
            character ramp as the sculpture on the home page.
          </p>
          <div className="about-actions">
            <Cta tone="on-blue" href={SOURCE_URL} external>View the source</Cta>
          </div>
        </Section>
      </main>
      <SiteFooter />
    </BrandTheme>
  );
}
