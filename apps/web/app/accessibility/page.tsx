import type { Metadata } from "next";
import { BrandEyebrow, BrandTheme, Cta, Section } from "@grad/ui";
import { getEvent } from "../../lib/api/event";
import { SiteFooter } from "../site/SiteFooter";
import { SiteHeader } from "../site/SiteHeader";
import { TextSizeControl } from "../text-size/TextSizeControl";
import "./accessibility.css";

export const metadata: Metadata = {
  title: "Accessibility · GRAD '26",
  description: "Getting into the venue, following the ceremony with captions, and how to ask for help.",
};

// The organizer contact comes from GET /event (cached 300 s), read at request time like /venue.
export const dynamic = "force-dynamic";

/**
 * Accessibility and assistance (#176), linked from the footer. Plain information, no overlay widget
 * (anti-patterns): the site itself is built to work with screen readers, keyboards, zoom and reduced
 * motion, and the one site-wide setting it adds is text size.
 */
export default async function AccessibilityPage() {
  const event = await getEvent();
  const contact = event.status === "ok" ? event.data.contact : null;
  const venueName = event.status === "ok" ? event.data.venue.name : "the ceremony venue";

  return (
    <BrandTheme>
      <SiteHeader />
      <main className="a11y-main">
        <Section tone="blue" aria-labelledby="a11y-heading">
          <div className="a11y-hero">
            <BrandEyebrow>Accessibility</BrandEyebrow>
            <h1 id="a11y-heading" className="a11y-title">Everyone is welcome at the ceremony</h1>
            <p className="a11y-lead">
              How to get into the venue, follow the ceremony and ask for help. Tell us what you need with your RSVP and
              we will plan for it.
            </p>
          </div>
        </Section>

        <Section tone="white" density="compact" narrow>
          <div className="a11y-body">
            <section aria-labelledby="venue-access-heading" className="a11y-block">
              <h2 id="venue-access-heading" className="a11y-heading">Getting into the venue</h2>
              {/* TODO(owner): confirm these venue facts with the university facilities team before the event. */}
              <ul className="a11y-list">
                <li>{venueName} has a step-free entrance, with ramps where there are steps.</li>
                <li>Wheelchair spaces and seats for companions are kept free near the aisles.</li>
                <li>An accessible toilet is on the ground floor.</li>
                <li>Cars can drop guests off close to the entrance; ask a helper at the gate.</li>
              </ul>
              <p>
                <a className="a11y-link" href="/venue">Directions, date and calendar</a>
              </p>
            </section>

            <section aria-labelledby="captions-heading" className="a11y-block">
              <h2 id="captions-heading" className="a11y-heading">Following the ceremony</h2>
              <p>
                Live captions show what is said on stage on your own phone, in Deutsch, English or Tiếng Việt. You can
                make the captions larger on that page. They are experimental: if they stop, the ceremony carries on as
                normal.
              </p>
              <p>
                <a className="a11y-link" href="/live">Open live captions</a>
              </p>
              {/* TODO(owner): confirm the large-print programme and the seats near the speakers. */}
              <p>A large-print programme and seats near the speakers are available if you ask with your RSVP.</p>
            </section>

            <section aria-labelledby="help-heading" className="a11y-block">
              <h2 id="help-heading" className="a11y-heading">Asking for help</h2>
              <ol className="a11y-list">
                <li>
                  <strong>Before the day:</strong> open your invitation and fill in &ldquo;Accessibility and assistance&rdquo; with
                  your RSVP. Only the organizers see it, and it is deleted after the event.
                </li>
                <li>
                  <strong>On the day:</strong> ask any helper at the entrance or the graduate who invited you. Someone can
                  meet you on arrival and guide you to your seat.
                </li>
                <li>
                  <strong>Anything else:</strong> contact the organizers below; there is no wrong question.
                </li>
              </ol>
              <div className="a11y-actions">
                {/* /me leads on to the invitation when signed in, and explains how to open it when not. */}
                <Cta tone="on-white" href="/me">Tell us with your RSVP</Cta>
              </div>
            </section>

            <section aria-labelledby="contact-heading" className="a11y-block">
              <h2 id="contact-heading" className="a11y-heading">Contact</h2>
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
                <p>Ask the graduate who invited you; they will pass it on to the organizers.</p>
              )}
              {/* TODO(owner): name a dedicated accessibility contact (name, phone, email) for the day. */}
            </section>
          </div>
        </Section>

        <Section tone="blue" density="compact" aria-labelledby="site-heading">
          <div className="a11y-site">
            <BrandEyebrow>This website</BrandEyebrow>
            <h2 id="site-heading" className="a11y-heading">Text size</h2>
            <p className="a11y-lead">Make the text larger on every page of this site. Your choice is kept on this device.</p>
            <TextSizeControl tone="on-blue" />
            <p className="a11y-note">
              The site also works with screen readers, keyboard only, your browser&apos;s zoom and the reduced-motion
              setting. If something does not work for you, tell the organizers and we will fix it.
            </p>
          </div>
        </Section>
      </main>
      <SiteFooter />
    </BrandTheme>
  );
}
