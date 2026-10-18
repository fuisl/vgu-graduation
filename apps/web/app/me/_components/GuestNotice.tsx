import type { EventConfig } from "@grad/contract";
import { BrandEyebrow, Cta, Section } from "@grad/ui";
import type { ApiResult } from "../../../lib/api/result";
import { GuestAvatar } from "../../guest-avatar/GuestAvatar";
import { GuestLinks } from "./GuestLinks";

export type GuestNoticeKind = "signed-out" | "invalid" | "expired" | "error";

/** A fixed, non-personal seed: the friendly face of the guest portal when nobody is signed in. */
const PORTAL_SEED = "grad26-guest-portal";

const COPY: Record<GuestNoticeKind, { title: string; lead: string }> = {
  "signed-out": {
    title: "Open your invitation",
    lead: "Your invitation is a personal link from the graduate who invited you. Open it once on this phone and this page becomes your guest profile.",
  },
  invalid: {
    title: "This invitation is no longer active",
    lead: "The link on this phone was replaced or withdrawn. Ask the graduate who invited you for a new one.",
  },
  expired: {
    title: "Your invitation has expired",
    lead: "Thank you for celebrating with us. If you still need something, contact an organizer.",
  },
  error: {
    title: "We could not load this page",
    lead: "This is a temporary problem, not a problem with your link. Please try again in a moment.",
  },
};

/**
 * What /me and /guide show without a usable invitation: a friendly explainer (signed out), or why the
 * invitation on this device no longer works. Never shows invitation data; only public event contact.
 * `eyebrow` names the page; `retryHref` is where "Try again" reloads.
 */
export function GuestNotice({
  kind,
  event,
  retryHref,
  eyebrow,
}: {
  kind: GuestNoticeKind;
  event: ApiResult<EventConfig>;
  retryHref: string;
  eyebrow: string;
}) {
  const { title, lead } = COPY[kind];
  const contact = event.status === "ok" ? event.data.contact : null;
  return (
    <>
      <Section tone="blue" aria-labelledby="notice-heading">
        <div className="profile-hero">
          <GuestAvatar seed={PORTAL_SEED} size={160} className="profile-hero__avatar" followTouch />
          <div className="profile-hero__text" role={kind === "error" ? "alert" : undefined}>
            <BrandEyebrow>{eyebrow}</BrandEyebrow>
            <h1 id="notice-heading" className="profile-name">{title}</h1>
            <p className="profile-lead">{lead}</p>
            {kind === "error" ? (
              <div className="profile-hero__action">
                <Cta tone="on-blue" href={retryHref}>Try again</Cta>
              </div>
            ) : null}
          </div>
        </div>
      </Section>

      <Section tone="white" density="compact">
        <div className="profile-grid">
          <div className="profile-stack">
            {kind === "signed-out" || kind === "invalid" ? (
              <section aria-labelledby="how-heading" className="profile-block">
                <h2 id="how-heading" className="profile-heading">How to open your invitation</h2>
                <ol className="profile-steps">
                  <li>Find the message from your graduate, by email or chat, with your personal invitation link.</li>
                  <li>Tap the link on the phone you will bring to the ceremony. It signs you in on that phone; there is no password.</li>
                  <li>Come back any time with the Guest portal button at the top of every page.</li>
                </ol>
                <p className="profile-note">
                  Keep the link to yourself: anyone who has it can answer for you. Lost it? Ask the graduate who invited you
                  {contact ? <> or {contact.name}</> : null}.
                </p>
              </section>
            ) : null}
            {contact ? (
              <section aria-labelledby="contact-heading" className="profile-block">
                <h2 id="contact-heading" className="profile-heading">Organizer</h2>
                <p>
                  {contact.name}
                  {contact.email ? (
                    <>
                      <br />
                      <a className="profile-inline-link" href={`mailto:${contact.email}`}>{contact.email}</a>
                    </>
                  ) : null}
                  {contact.phone ? (
                    <>
                      <br />
                      <a className="profile-inline-link" href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>{contact.phone}</a>
                    </>
                  ) : null}
                </p>
              </section>
            ) : null}
          </div>
          <section aria-labelledby="public-links-heading" className="profile-block">
            <h2 id="public-links-heading" className="profile-heading">Open to everyone</h2>
            <GuestLinks signedIn={false} headingId="public-links-heading" />
          </section>
        </div>
      </Section>
    </>
  );
}
