import type { EventConfig, Invitation } from "@grad/contract";
import { BrandEyebrow, Cta, Section } from "@grad/ui";
import type { ApiResult } from "../../../lib/api/result";
import { pickMessages, type I18n } from "../../../lib/i18n/dictionary";
import { summarizeRsvp } from "../../../lib/invite/format";
import { RSVP_MESSAGES } from "../../../lib/invite/rsvp-form";
import { Suspense } from "react";
import type { SavedNeeds } from "../../../lib/invite/accessibility";
import { EventDetails } from "./EventDetails";
import { PassBadge, PassBadgeSkeleton } from "./PassBadge";
import { RsvpForm } from "./RsvpForm";

/**
 * The personalized invitation: a blue header band, then a compact white section
 * holding event details and the pass (left) and RSVP status and form (right).
 * The pass stays a card-like object inside the white section.
 */
export function PersonalInvitation({
  invitation,
  event,
  savedNeeds,
  i18n,
}: {
  invitation: Invitation;
  event: ApiResult<EventConfig>;
  savedNeeds: SavedNeeds;
  i18n: I18n;
}) {
  const { t } = i18n;
  const inviters = invitation.inviters.map((inviter) => inviter.name);
  return (
    <>
      <Section tone="blue" aria-labelledby="greeting-heading">
        <BrandEyebrow>{t("invite.eyebrow")}</BrandEyebrow>
        <h1 id="greeting-heading" className="invite-title">{t("invite.greeting", { name: invitation.guest.name })}</h1>
        {inviters.length > 0 ? <p className="invite-lead">{t("invite.invitedBy", { names: inviters.join(", ") })}</p> : null}
        <p className="invite-lead">
          {invitation.maxPlusOnes > 0 ? t.plural("invite.plusOnes", invitation.maxPlusOnes) : t("invite.plusOnesNone")}
        </p>
      </Section>

      <Section tone="white" density="compact">
        <div className="invite-grid">
          <div className="invite-stack">
            <section aria-labelledby="rsvp-status-heading" className="invite-body">
              <h2 id="rsvp-status-heading" className="invite-heading">{t("invite.rsvpHeading")}</h2>
              <p>{summarizeRsvp(invitation.rsvp, i18n)}</p>
            </section>
            <section aria-labelledby="rsvp-form-heading" className="invite-body">
              <RsvpForm invitation={invitation} savedNeeds={savedNeeds} messages={pickMessages(i18n.locale, ...RSVP_MESSAGES)} />
            </section>
          </div>
          <div className="invite-stack">
            <EventDetails event={event} i18n={i18n} />
            <Suspense fallback={<PassBadgeSkeleton i18n={i18n} />}>
              <PassBadge guestName={invitation.guest.name} event={event} i18n={i18n} />
            </Suspense>
            <section aria-labelledby="guide-link-heading" className="invite-body">
              <h2 id="guide-link-heading" className="invite-heading">{t("invite.guide.title")}</h2>
              <p>{t("invite.guide.body")}</p>
              <Cta tone="on-white" variant="secondary" href="/guide">{t("invite.guide.open")}</Cta>
            </section>
          </div>
        </div>
      </Section>
    </>
  );
}
