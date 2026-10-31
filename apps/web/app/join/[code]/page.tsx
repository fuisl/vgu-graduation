import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandEyebrow, BrandTheme, Section } from "@grad/ui";
import { joinCodeSchema } from "@grad/contract";
import { getJoinInfo } from "../../../lib/api/join";
import { isMailEnabled } from "../../../lib/api/mail";
import { pickMessages } from "../../../lib/i18n/dictionary";
import { getI18n } from "../../../lib/i18n/server";
import { SiteFooter } from "../../site/SiteFooter";
import { SiteHeader } from "../../site/SiteHeader";
import { JoinForm } from "../_components/JoinForm";
import "../join.css";

// A graduate's link, shared by hand: keep it out of search and out of Referer headers.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("join.metaTitle"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export const dynamic = "force-dynamic";

/**
 * /join/{code}: a guest registers through a graduate's link (ADR-015). A blue band says who is
 * inviting; the form on white asks for a name and email and the invitation arrives by email.
 * Unknown codes are a 404; while the API is unreachable or can't send mail, the band says so and
 * no form is shown, so it never promises an email that can't go.
 */
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!joinCodeSchema.safeParse(code).success) notFound();
  const [info, mailEnabled, i18n] = await Promise.all([getJoinInfo(code), isMailEnabled(), getI18n()]);
  if (info.status === "unknown") notFound();
  const { t, locale } = i18n;
  const open = info.status === "ok" && mailEnabled;

  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      <main id="main" className="join-main">
        <Section tone="blue" aria-labelledby="join-heading">
          <BrandEyebrow>{t("join.eyebrow")}</BrandEyebrow>
          <h1 id="join-heading" className="join-title">
            {info.status === "ok" ? t("join.title", { name: info.data.graduate.name }) : t("join.titleGeneric")}
          </h1>
          <p className="join-lead">{open ? t("join.lead") : t("join.closed")}</p>
        </Section>
        {open ? (
          <Section tone="white" density="compact" narrow>
            <JoinForm code={code} messages={pickMessages(locale, "join.form.")} />
          </Section>
        ) : null}
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
