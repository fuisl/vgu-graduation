import type { Metadata } from "next";
import { BrandEyebrow, BrandTheme, Cta, Section } from "@grad/ui";
import { getI18n } from "../lib/i18n/server";
import { SiteFooter } from "./site/SiteFooter";
import { SiteHeader } from "./site/SiteHeader";
import "./not-found.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("notFound.metaTitle") };
}

export default async function NotFound() {
  const i18n = await getI18n();
  const { t } = i18n;
  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      <main>
        <Section tone="blue" aria-labelledby="notfound-title">
          <div className="notfound">
            <BrandEyebrow>{t("notFound.eyebrow")}</BrandEyebrow>
            <h1 id="notfound-title" className="notfound-title">{t("notFound.title")}</h1>
            <p className="notfound-text">{t("notFound.text")}</p>
            <Cta tone="on-blue" href="/">{t("notFound.home")}</Cta>
          </div>
        </Section>
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
