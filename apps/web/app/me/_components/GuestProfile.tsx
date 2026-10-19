import type { EventConfig, Invitation } from "@grad/contract";
import { BrandEyebrow, Cta, Section } from "@grad/ui";
import type { ApiResult } from "../../../lib/api/result";
import { buildCalendarLinks } from "../../../lib/calendar/links";
import { pickMessages, type I18n } from "../../../lib/i18n/dictionary";
import { summarizeRsvp } from "../../../lib/invite/format";
import { guestBadgeCard, guestBadgeLabels } from "../../../lib/profile/badge";
import { AddToCalendar } from "../../calendar/AddToCalendar";
import { StillAvatar } from "../../guest-avatar/GuestAvatar";
import { BadgeStage } from "../../guest/badge/BadgeStage";
import type { PassArt } from "../../guest/badge/card";
import { NameBadge } from "../../guest/badge/NameBadge";
import { GuestLinks } from "./GuestLinks";

/**
 * The signed-in guest portal (#139): the guest's name badge drops in as the hero, and the only
 * text beside it is where they stand and their one next action, plus who invited them. Then a
 * compact white band with the guest's own utilities. Event facts live in the site menu, not here.
 * `art` is the pass QR, started by the page and never awaited by it.
 */
export function GuestProfile({ invitation, event, art, i18n }: {
  invitation: Invitation;
  event: ApiResult<EventConfig>;
  art: Promise<PassArt | null> | null;
  i18n: I18n;
}) {
  const { t } = i18n;
  const { guest, inviters, rsvp } = invitation;
  const badge = (
    <NameBadge card={guestBadgeCard(guest, event, i18n)} art={art ?? undefined} labels={guestBadgeLabels(guest.name, i18n)} />
  );
  return (
    <>
      <BadgeStage labelledBy="profile-heading" badge={badge}>
        <BrandEyebrow>{t("profile.eyebrow")}</BrandEyebrow>
        {/* The badge is the visual title; the heading names the page for assistive tech. */}
        <h1 id="profile-heading" className="brand-sr-only">{guest.name}</h1>
        <p className="profile-status">{summarizeRsvp(rsvp, i18n)}</p>
        <NextAction invitation={invitation} event={event} i18n={i18n} />
        {inviters.length > 0 ? (
          <div className="profile-inviters-block">
            <BrandEyebrow>{t("profile.invitedBy")}</BrandEyebrow>
            <ul className="profile-inviters">
              {inviters.map((inviter) => (
                <li key={inviter.id} className="profile-inviter">
                  <StillAvatar seed={inviter.id} size={32} />
                  <span>{inviter.name}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </BadgeStage>

      <Section tone="white" density="compact" aria-labelledby="links-heading">
        <div className="profile-block profile-day">
          <h2 id="links-heading" className="profile-heading">{t("profile.yourDay")}</h2>
          <GuestLinks headingId="links-heading" art={art} i18n={i18n} />
        </div>
      </Section>
    </>
  );
}

/**
 * The one thing to do next: answer the invitation; once attending, put the day in the calendar
 * (changing the answer stays one tap away); after declining, change the answer.
 */
function NextAction({ invitation, event, i18n }: { invitation: Invitation; event: ApiResult<EventConfig>; i18n: I18n }) {
  const { t } = i18n;
  const { rsvp } = invitation;
  if (!rsvp) {
    return <Cta tone="on-blue" href="/invite#rsvp">{t("profile.respond")}</Cta>;
  }
  if (rsvp.attending && event.status === "ok") {
    return (
      <div className="profile-actions">
        <AddToCalendar
          links={buildCalendarLinks(event.data, undefined, { directions: t("calendar.directions") })}
          messages={pickMessages(i18n.locale, "calendar.")}
          tone="on-blue"
          show="action"
          emphasis="primary"
        />
        <Cta tone="on-blue" variant="secondary" href="/invite#rsvp">{t("rsvp.form.change")}</Cta>
      </div>
    );
  }
  return rsvp.attending
    ? <Cta tone="on-blue" href="/invite">{t("profile.openInvitation")}</Cta>
    : <Cta tone="on-blue" href="/invite#rsvp">{t("rsvp.form.change")}</Cta>;
}
