import type { AdminInvitationRow, Rsvp } from "@grad/contract";

/** One-line RSVP summary for admin tables: "Attending +2 of 3", "Declined", "No answer". */
export function describeRsvp(rsvp: Pick<Rsvp, "attending" | "plusOnesCount"> | null, maxPlusOnes: number): string {
  if (!rsvp) return "No answer";
  if (!rsvp.attending) return "Declined";
  return maxPlusOnes > 0 ? `Attending +${rsvp.plusOnesCount} of ${maxPlusOnes}` : "Attending";
}

export interface AdminCounts {
  invitations: { total: number; active: number; revoked: number };
  rsvp: { attending: number; declined: number; pending: number; plusOnes: number };
}

/**
 * Overview counts derived from GET /admin/invitations (there is no
 * GET /admin/overview yet). RSVP counts cover active invitations only: a
 * revoked guest's earlier answer no longer counts. `pending` is an active
 * invitation with no answer; `plusOnes` sums the plus-ones of attending guests.
 */
export function computeAdminCounts(invitations: readonly AdminInvitationRow[]): AdminCounts {
  const counts: AdminCounts = {
    invitations: { total: invitations.length, active: 0, revoked: 0 },
    rsvp: { attending: 0, declined: 0, pending: 0, plusOnes: 0 },
  };

  for (const invitation of invitations) {
    if (invitation.status === "revoked") {
      counts.invitations.revoked += 1;
      continue;
    }
    counts.invitations.active += 1;
    if (!invitation.rsvp) {
      counts.rsvp.pending += 1;
    } else if (invitation.rsvp.attending) {
      counts.rsvp.attending += 1;
      counts.rsvp.plusOnes += invitation.rsvp.plusOnesCount;
    } else {
      counts.rsvp.declined += 1;
    }
  }

  return counts;
}
