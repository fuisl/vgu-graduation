import Link from "next/link";
import { BrandEyebrow, Cta, Section } from "@grad/ui";
import type { EventConfig } from "@grad/contract";
import type { ApiResult } from "../../../lib/api/result";
import type { I18n } from "../../../lib/i18n/dictionary";
import { EventDetails } from "./EventDetails";

export type NoticeKind = "missing" | "invalid" | "expired" | "error";

/**
 * No invitation data is shown here, only the notice and public event information. Copy is `invite.notice.<kind>.*`.
 * `missing` (no invitation cookie on this browser, QA P2-7) points to the guest portal, which explains how to open the link.
 */
export function InviteNotice({ kind, event, i18n }: { kind: NoticeKind; event: ApiResult<EventConfig>; i18n: I18n }) {
  const { t } = i18n;
  const contact = event.status === "ok" ? event.data.contact : null;
  return (
    <>
      <Section tone="blue" aria-labelledby="notice-heading">
        <div role={kind === "error" ? "alert" : undefined}>
          <BrandEyebrow>{t("invite.eyebrow")}</BrandEyebrow>
          <h1 id="notice-heading" className="invite-title">{t(`invite.notice.${kind}.title`)}</h1>
          <p className="invite-lead">{t(`invite.notice.${kind}.body`)}</p>
          {kind === "error" ? (
            <p className="invite-lead">
              <Link className="invite-link invite-link--on-blue" href="/invite" prefetch={false}>{t("common.tryAgain")}</Link>
            </p>
          ) : null}
          {kind === "missing" ? (
            <div className="invite-actions">
              <Cta tone="on-blue" href="/me">{t("invite.notice.missing.link")}</Cta>
            </div>
          ) : null}
          {(kind === "invalid" || kind === "expired") && contact ? (
            <p className="invite-lead">
              {t("invite.notice.organizer", { name: contact.name })}
              {contact.email ? (
                <>
                  {" "}
                  · <a className="invite-link invite-link--on-blue" href={`mailto:${contact.email}`}>{contact.email}</a>
                </>
              ) : null}
              {contact.phone ? <> · {contact.phone}</> : null}
            </p>
          ) : null}
        </div>
      </Section>
      <Section tone="white" density="compact" narrow>
        <EventDetails event={event} i18n={i18n} />
      </Section>
    </>
  );
}
