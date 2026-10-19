import type { EventConfig, Invitation } from "@grad/contract";
import { BrandEyebrow, Cta, Section } from "@grad/ui";
import { Suspense } from "react";
import type { ApiResult } from "../../../lib/api/result";
import { pickMessages, type I18n } from "../../../lib/i18n/dictionary";
import { summarizeRsvp } from "../../../lib/invite/format";
import { guestGivenName } from "../../../lib/invite/guest-name";
import { GuestAvatar, StillAvatar } from "../../guest-avatar/GuestAvatar";
import { PassBadge, PassBadgeSkeleton } from "../../invite/_components/PassBadge";
import { TextSizeControl } from "../../text-size/TextSizeControl";
import { GuestLinks } from "./GuestLinks";

/**
 * The signed-in guest profile (#139), a GitHub-like page in the brand language: a blue band with the
 * large animated blobatar, the given name and the RSVP state, then a white working band with who
 * invited them, quick links, text size and the pass. The avatar seed is the guest id, never the token.
 */
export function GuestProfile({ invitation, event, i18n }: { invitation: Invitation; event: ApiResult<EventConfig>; i18n: I18n }) {
  const { t } = i18n;
  const { guest, inviters, rsvp } = invitation;
  const givenName = guestGivenName(guest);
  return (
    <>
      <Section tone="blue" aria-labelledby="profile-heading">
        <div className="profile-hero">
          <GuestAvatar seed={guest.id} size={160} className="profile-hero__avatar" followTouch />
          <div className="profile-hero__text">
            <BrandEyebrow>{t("profile.eyebrow")}</BrandEyebrow>
            <h1 id="profile-heading" className="profile-name">{givenName}</h1>
            {guest.name !== givenName ? <p className="profile-fullname">{guest.name}</p> : null}
            <p className="profile-lead">
              <span className="profile-label">{t("profile.rsvp")}</span> {summarizeRsvp(rsvp, i18n)}
            </p>
            <div className="profile-hero__action">
              <Cta tone="on-blue" href="/invite">{rsvp ? t("profile.openInvitation") : t("profile.respond")}</Cta>
            </div>
          </div>
        </div>
      </Section>

      <Section tone="white" density="compact">
        <div className="profile-grid">
          <div className="profile-stack">
            {inviters.length > 0 ? (
              <section aria-labelledby="inviters-heading" className="profile-block">
                <h2 id="inviters-heading" className="profile-heading">{t("profile.invitedBy")}</h2>
                <ul className="profile-inviters">
                  {inviters.map((inviter) => (
                    <li key={inviter.id} className="profile-inviter">
                      <StillAvatar seed={inviter.id} size={36} />
                      <span>{inviter.name}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section aria-labelledby="links-heading" className="profile-block">
              <h2 id="links-heading" className="profile-heading">{t("profile.yourDay")}</h2>
              <GuestLinks signedIn headingId="links-heading" i18n={i18n} />
            </section>

            <section aria-labelledby="text-size-heading" className="profile-block">
              <h2 id="text-size-heading" className="profile-heading">{t("textSize.label")}</h2>
              <p className="profile-note">{t("profile.textSizeNote")}</p>
              <TextSizeControl messages={pickMessages(i18n.locale, "textSize.")} />
            </section>
          </div>

          <div className="profile-stack">
            <Suspense fallback={<PassBadgeSkeleton i18n={i18n} />}>
              <PassBadge guestName={guest.name} event={event} i18n={i18n} />
            </Suspense>
            <p className="profile-note">{t("profile.passNote")}</p>
          </div>
        </div>
      </Section>
    </>
  );
}
