import type { EventConfig } from "@grad/contract";
import { BrandEyebrow, Cta, Section } from "@grad/ui";
import type { ReactNode } from "react";
import type { ApiResult } from "../../../lib/api/result";
import type { I18n } from "../../../lib/i18n/dictionary";
import { GuestAvatar } from "../../guest-avatar/GuestAvatar";
import { BadgeStage } from "../../guest/badge/BadgeStage";

export type GuestNoticeKind = "signed-out" | "invalid" | "expired" | "error";

/** A fixed, non-personal seed: the friendly face of the guest portal when nobody is signed in. */
const PORTAL_SEED = "grad26-guest-portal";

/**
 * What /me and /guide show without a usable invitation: a short explainer (signed out), or why the
 * invitation on this device no longer works. Never shows invitation data; only public event contact.
 * `eyebrow` names the page; `retryHref` is where "Try again" reloads. With `badge` (the unnamed demo
 * badge on /me) the hero is the badge stage, so a guest sees what the portal holds once they open
 * their link; otherwise it is the portal's face. Copy is `profile.notice.<kind>.*` (#9).
 */
export function GuestNotice({
  kind,
  event,
  retryHref,
  eyebrow,
  badge,
  i18n,
}: {
  kind: GuestNoticeKind;
  event: ApiResult<EventConfig>;
  retryHref: string;
  eyebrow: string;
  badge?: ReactNode;
  i18n: I18n;
}) {
  const { t } = i18n;
  const contact = event.status === "ok" ? event.data.contact : null;
  const steps = kind === "signed-out" || kind === "invalid";
  const text = (
    <div className="profile-hero__text" role={kind === "error" ? "alert" : undefined}>
      <BrandEyebrow>{eyebrow}</BrandEyebrow>
      <h1 id="notice-heading" className="profile-name">{t(`profile.notice.${kind}.title`)}</h1>
      <p className="profile-lead">{t(`profile.notice.${kind}.lead`)}</p>
      {kind === "error" ? (
        <div className="profile-hero__action">
          <Cta tone="on-blue" href={retryHref}>{t("common.tryAgain")}</Cta>
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      {badge ? (
        <BadgeStage labelledBy="notice-heading" badge={badge}>{text}</BadgeStage>
      ) : (
        <Section tone="blue" aria-labelledby="notice-heading">
          <div className="profile-hero">
            <GuestAvatar seed={PORTAL_SEED} size={160} className="profile-hero__avatar" followTouch />
            {text}
          </div>
        </Section>
      )}

      {steps || contact ? (
        <Section tone="white" density="compact" narrow>
          <div className="profile-stack">
            {steps ? (
              <section aria-labelledby="how-heading" className="profile-block">
                <h2 id="how-heading" className="profile-heading">{t("profile.how.title")}</h2>
                <ol className="profile-steps">
                  <li>{t("profile.how.step1")}</li>
                  <li>{t("profile.how.step2")}</li>
                  <li>{t("profile.how.step3")}</li>
                </ol>
                <p className="profile-note">
                  {contact ? t("profile.how.keepContact", { name: contact.name }) : t("profile.how.keep")}
                </p>
              </section>
            ) : null}
            {contact ? (
              <section aria-labelledby="contact-heading" className="profile-block">
                <h2 id="contact-heading" className="profile-heading">{t("common.organizer")}</h2>
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
        </Section>
      ) : null}
    </>
  );
}
