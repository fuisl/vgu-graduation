import { ACCESSIBILITY_NOTE_MAX_LENGTH, type EventConfig, type Invitation } from "@grad/contract";
import { BrandEyebrow, Section } from "@grad/ui";
import type { ApiResult } from "../../../lib/api/result";
import { pickMessages, type I18n } from "../../../lib/i18n/dictionary";
import { summarizeRsvp } from "../../../lib/invite/format";
import { RSVP_MESSAGES } from "../../../lib/invite/rsvp-form";
import type { SavedNeeds } from "../../../lib/invite/accessibility";
import { EventDetails } from "./EventDetails";
import { LinkRows } from "./LinkRows";
import { RsvpForm } from "./RsvpForm";

/**
 * The personalized invitation: a blue greeting band, then one compact white band where the RSVP
 * is the obvious action. Below it the ceremony details (calendar, directions, captions) fold into
 * a disclosure, and the name badge and guide-book are one row each; the date and venue are in the
 * site menu, so they are not repeated in the open.
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
      </Section>

      <Section tone="white" density="compact" narrow id="rsvp">
        <div className="invite-stack">
          <RsvpForm
            invitation={invitation}
            savedNeeds={savedNeeds}
            status={invitation.rsvp ? summarizeRsvp(invitation.rsvp, i18n) : null}
            allowance={invitation.maxPlusOnes > 0 ? t.plural("invite.plusOnes", invitation.maxPlusOnes) : t("invite.plusOnesNone")}
            messages={pickMessages(i18n.locale, ...RSVP_MESSAGES)}
            noteMaxLength={ACCESSIBILITY_NOTE_MAX_LENGTH}
          />
          <div className="invite-more">
            <details className="invite-assist">
              <summary className="invite-assist__summary">
                <span className="invite-assist__title">{t("invite.details.title")}</span>
                <span className="invite-assist__hint">{t("invite.details.hint")}</span>
              </summary>
              <div className="invite-assist__body">
                <EventDetails event={event} i18n={i18n} />
              </div>
            </details>
            <h2 id="invite-more-heading" className="brand-sr-only">{t("invite.more.title")}</h2>
            <LinkRows
              labelledBy="invite-more-heading"
              rows={[
                { href: "/me", label: t("invite.more.badge") },
                { href: "/guide", label: t("invite.more.guide") },
              ]}
            />
          </div>
        </div>
      </Section>
    </>
  );
}
