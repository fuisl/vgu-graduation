import type { EventConfig, Invitation } from "@grad/contract";
import { BrandEyebrow, Section } from "@grad/ui";
import type { ApiResult } from "../../../lib/api/result";
import { summarizeRsvp } from "../../../lib/invite/format";
import { Suspense } from "react";
import { EventDetails } from "./EventDetails";
import { PassBadge, PassBadgeSkeleton } from "./PassBadge";
import { RsvpForm } from "./RsvpForm";

/**
 * The personalized invitation: a blue header band, then a compact white section
 * holding event details and the pass (left) and RSVP status and form (right).
 * The pass stays a card-like object inside the white section.
 */
export function PersonalInvitation({ invitation, event }: { invitation: Invitation; event: ApiResult<EventConfig> }) {
  const inviters = invitation.inviters.map((inviter) => inviter.name);
  return (
    <>
      <Section tone="blue" aria-labelledby="greeting-heading">
        <BrandEyebrow>Your invitation</BrandEyebrow>
        <h1 id="greeting-heading" className="invite-title">You are invited, {invitation.guest.name}</h1>
        {inviters.length > 0 ? <p className="invite-lead">Invited by {inviters.join(", ")}.</p> : null}
        <p className="invite-lead">
          {invitation.maxPlusOnes > 0
            ? `You may bring up to ${invitation.maxPlusOnes} ${invitation.maxPlusOnes === 1 ? "guest" : "guests"}.`
            : "This invitation is for you only."}
        </p>
      </Section>

      <Section tone="white" density="compact">
        <div className="invite-grid">
          <div className="invite-stack">
            <section aria-labelledby="rsvp-status-heading" className="invite-body">
              <h2 id="rsvp-status-heading" className="invite-heading">Your RSVP</h2>
              <p>{summarizeRsvp(invitation.rsvp)}</p>
            </section>
            <section aria-labelledby="rsvp-form-heading" className="invite-body">
              <RsvpForm invitation={invitation} />
            </section>
          </div>
          <div className="invite-stack">
            <EventDetails event={event} />
            <Suspense fallback={<PassBadgeSkeleton />}>
              <PassBadge guestName={invitation.guest.name} event={event} />
            </Suspense>
          </div>
        </div>
      </Section>
    </>
  );
}
