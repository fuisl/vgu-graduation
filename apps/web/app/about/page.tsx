import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { BrandEyebrow, BrandTheme, Cta, Section } from "@grad/ui";
import { getI18n } from "../../lib/i18n/server";
import { SiteFooter } from "../site/SiteFooter";
import { SiteHeader } from "../site/SiteHeader";
import { PortraitReveal } from "./PortraitReveal";
import { PORTRAIT_COLS, PORTRAITS } from "./portraits.generated";
import { SOURCE_URL, TEAM, githubUrl } from "./team";
import "./about.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("about.metaTitle"), description: t("about.metaDescription") };
}

/**
 * About and credits (#7): who built the site, as ASCII portraits that print once on scroll-in.
 * Fully static; the only client code is PortraitReveal. Linked from the footer ("Credits"), not
 * the menubar, which keeps to the event (docs/design/landing.md, About page).
 */
export default async function AboutPage() {
  const grid = { "--portrait-cols": PORTRAIT_COLS } as CSSProperties;
  const i18n = await getI18n();
  const { t } = i18n;

  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      <main id="main" className="about-main">
        <Section tone="blue" aria-labelledby="about-heading">
          <BrandEyebrow ellipsis>{t("about.eyebrow")}</BrandEyebrow>
          <h1 id="about-heading" className="about-title">{t("about.title")}</h1>
          <p className="about-lead">{t("about.lead")}</p>
        </Section>

        <Section tone="white" aria-labelledby="team-heading">
          <BrandEyebrow>{t("about.team.eyebrow")}</BrandEyebrow>
          <h2 id="team-heading" className="about-h2">{t("about.team.title")}</h2>
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
                    <span className="brand-sr-only"> {t("about.github")}</span>
                  </a>
                </h3>
                <p className="about-dev__roles">{dev.roles.map((role) => t(`about.role.${role}`)).join(" · ")}</p>
                <p className="about-dev__bio">{t(`about.bio.${dev.handle}`)}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section tone="blue" aria-labelledby="source-heading">
          <BrandEyebrow>{t("about.source.eyebrow")}</BrandEyebrow>
          <h2 id="source-heading" className="about-h2">{t("about.source.title")}</h2>
          <p className="about-lead">{t("about.source.body")}</p>
          <div className="about-actions">
            <Cta tone="on-blue" href={SOURCE_URL} external>{t("about.source.cta")}</Cta>
          </div>
        </Section>
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
