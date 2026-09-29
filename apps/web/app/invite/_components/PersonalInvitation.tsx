import type { EventConfig, Invitation } from "@grad/contract";
import type { ApiResult } from "../../../lib/api/result";
import { summarizeRsvp } from "../../../lib/invite/format";
import { EventDetails } from "./EventDetails";
import { RsvpForm } from "./RsvpForm";

/**
 * The personalized invitation, composed of independent sections. Each later
 * feature is one more self-contained <section> added in the marked slot; the
 * sections above and below it do not change:
 *   - #40 pass/badge: `<PassSection invitation={invitation} />`
 *   - #38 RSVP form:  `<RsvpFormSection invitation={invitation} />`
 */
export function PersonalInvitation({ invitation, event }: { invitation: Invitation; event: ApiResult<EventConfig> }) {
  const inviters = invitation.inviters.map((inviter) => inviter.name);
  return (
    <>
      <section aria-labelledby="greeting-heading">
        <h1 id="greeting-heading">You are invited, {invitation.guest.name}</h1>
        {inviters.length > 0 ? <p>Invited by {inviters.join(", ")}.</p> : null}
        <p>
          {invitation.maxPlusOnes > 0
            ? `You may bring up to ${invitation.maxPlusOnes} ${invitation.maxPlusOnes === 1 ? "guest" : "guests"}.`
            : "This invitation is for you only."}
        </p>
      </section>

      <EventDetails event={event} />

      <section aria-labelledby="rsvp-status-heading">
        <h2 id="rsvp-status-heading">Your RSVP</h2>
        <p>{summarizeRsvp(invitation.rsvp)}</p>
      </section>

      <section aria-labelledby="rsvp-form-heading"><RsvpForm invitation={invitation} /></section>
      {/* SLOT #40: pass/badge section goes here. */}
    </>
  );
}
