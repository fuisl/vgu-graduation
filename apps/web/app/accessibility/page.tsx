import type { Metadata } from "next";
import { BrandEyebrow, BrandTheme, Cta, Section } from "@grad/ui";
import { getEvent } from "../../lib/api/event";
import { pickMessages } from "../../lib/i18n/dictionary";
import { getI18n } from "../../lib/i18n/server";
import { SiteFooter } from "../site/SiteFooter";
import { SiteHeader } from "../site/SiteHeader";
import { TextSizeControl } from "../text-size/TextSizeControl";
import "./accessibility.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("a11y.metaTitle"), description: t("a11y.metaDescription") };
}

// The organizer contact comes from GET /event (cached 300 s), read at request time like /venue.
export const dynamic = "force-dynamic";

/**
 * Accessibility and assistance (#176), linked from the footer. Plain information, no overlay widget
 * (anti-patterns): the site itself is built to work with screen readers, keyboards, zoom and reduced
 * motion, and the one site-wide setting it adds is text size.
 */
export default async function AccessibilityPage() {
  const [event, i18n] = await Promise.all([getEvent(), getI18n()]);
  const { t } = i18n;
  const contact = event.status === "ok" ? event.data.contact : null;
  // The venue name is a proper noun, the same in both languages.
  const venueName = event.status === "ok" ? event.data.venue.name : t("a11y.venueFallback");

  return (
    <BrandTheme>
      <SiteHeader i18n={i18n} />
      <main className="a11y-main">
        <Section tone="blue" aria-labelledby="a11y-heading">
          <div className="a11y-hero">
            <BrandEyebrow>{t("footer.accessibility")}</BrandEyebrow>
            <h1 id="a11y-heading" className="a11y-title">{t("a11y.title")}</h1>
            <p className="a11y-lead">{t("a11y.lead")}</p>
          </div>
        </Section>

        <Section tone="white" density="compact" narrow>
          <div className="a11y-body">
            <section aria-labelledby="venue-access-heading" className="a11y-block">
              <h2 id="venue-access-heading" className="a11y-heading">{t("a11y.venue.title")}</h2>
              {/* TODO(owner): confirm these venue facts with the university facilities team before the event. */}
              <ul className="a11y-list">
                <li>{t("a11y.venue.stepFree", { venue: venueName })}</li>
                <li>{t("a11y.venue.wheelchair")}</li>
                <li>{t("a11y.venue.toilet")}</li>
                <li>{t("a11y.venue.dropOff")}</li>
              </ul>
              <p>
                <a className="a11y-link" href="/venue">{t("a11y.venue.link")}</a>
              </p>
            </section>

            <section aria-labelledby="captions-heading" className="a11y-block">
              <h2 id="captions-heading" className="a11y-heading">{t("a11y.captions.title")}</h2>
              <p>{t("a11y.captions.body")}</p>
              <p>
                <a className="a11y-link" href="/live">{t("a11y.captions.link")}</a>
              </p>
              {/* TODO(owner): confirm the large-print programme and the seats near the speakers. */}
              <p>{t("a11y.captions.print")}</p>
            </section>

            <section aria-labelledby="help-heading" className="a11y-block">
              <h2 id="help-heading" className="a11y-heading">{t("a11y.help.title")}</h2>
              <ol className="a11y-list">
                <li>
                  <strong>{t("a11y.help.beforeLabel")}</strong> {t("a11y.help.before")}
                </li>
                <li>
                  <strong>{t("a11y.help.dayLabel")}</strong> {t("a11y.help.day")}
                </li>
                <li>
                  <strong>{t("a11y.help.elseLabel")}</strong> {t("a11y.help.else")}
                </li>
              </ol>
              <div className="a11y-actions">
                {/* /me leads on to the invitation when signed in, and explains how to open it when not. */}
                <Cta tone="on-white" href="/me">{t("a11y.help.cta")}</Cta>
              </div>
            </section>

            <section aria-labelledby="contact-heading" className="a11y-block">
              <h2 id="contact-heading" className="a11y-heading">{t("common.contact")}</h2>
              {contact ? (
                <p>
                  {contact.name}
                  {contact.email ? (
                    <>
                      <br />
                      <a className="a11y-link" href={`mailto:${contact.email}`}>{contact.email}</a>
                    </>
                  ) : null}
                  {contact.phone ? (
                    <>
                      <br />
                      <a className="a11y-link" href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>{contact.phone}</a>
                    </>
                  ) : null}
                </p>
              ) : (
                <p>{t("a11y.contact.none")}</p>
              )}
              {/* TODO(owner): name a dedicated accessibility contact (name, phone, email) for the day. */}
            </section>
          </div>
        </Section>

        <Section tone="blue" density="compact" aria-labelledby="site-heading">
          <div className="a11y-site">
            <BrandEyebrow>{t("a11y.site.eyebrow")}</BrandEyebrow>
            <h2 id="site-heading" className="a11y-heading">{t("textSize.label")}</h2>
            <p className="a11y-lead">{t("a11y.site.lead")}</p>
            <TextSizeControl tone="on-blue" messages={pickMessages(i18n.locale, "textSize.")} />
            <p className="a11y-note">{t("a11y.site.note")}</p>
          </div>
        </Section>
      </main>
      <SiteFooter i18n={i18n} />
    </BrandTheme>
  );
}
