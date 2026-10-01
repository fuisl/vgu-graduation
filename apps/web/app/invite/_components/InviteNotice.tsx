import Link from "next/link";
import { BrandEyebrow, Section } from "@grad/ui";
import type { EventConfig } from "@grad/contract";
import type { ApiResult } from "../../../lib/api/result";
import { EventDetails } from "./EventDetails";

export type NoticeKind = "invalid" | "expired" | "error";

const COPY: Record<NoticeKind, { title: string; body: string }> = {
  invalid: {
    title: "This invitation link isn't valid",
    body: "The link may be incomplete, replaced or withdrawn. Please contact an organizer for a new one.",
  },
  expired: {
    title: "This invitation has expired",
    body: "Please contact an organizer if you still need to respond.",
  },
  error: {
    title: "We couldn't load your invitation",
    body: "This is a temporary problem, not a problem with your link. Refresh the page to try again.",
  },
};

/** No invitation data is shown here, only the notice and public event information. */
export function InviteNotice({ kind, event }: { kind: NoticeKind; event: ApiResult<EventConfig> }) {
  const { title, body } = COPY[kind];
  const contact = event.status === "ok" ? event.data.contact : null;
  return (
    <>
      <Section tone="blue" aria-labelledby="notice-heading">
        <div role={kind === "error" ? "alert" : undefined}>
          <BrandEyebrow>Your invitation</BrandEyebrow>
          <h1 id="notice-heading" className="invite-title">{title}</h1>
          <p className="invite-lead">{body}</p>
          {kind === "error" ? (
            <p className="invite-lead">
              <Link className="invite-link invite-link--on-blue" href="/invite" prefetch={false}>Try again</Link>
            </p>
          ) : null}
          {kind !== "error" && contact ? (
            <p className="invite-lead">
              Organizer: {contact.name}
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
        <EventDetails event={event} />
      </Section>
    </>
  );
}
