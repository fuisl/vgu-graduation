import type { PutRsvpRequest } from "@grad/contract";
import { asc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { guests, invitations, rsvp } from "../../db/schema.js";

export interface StoredRsvp {
  id: string;
  attending: boolean;
  plusOnesCount: number;
  dietaryRequirements: string | null;
  notes: string | null;
  updatedAt: Date;
}

export interface StoredRsvpRow {
  invitationId: string;
  guestName: string;
  maxPlusOnes: number;
  rsvp: StoredRsvp | null;
}

const rsvpColumns = {
  id: rsvp.id,
  attending: rsvp.attending,
  plusOnesCount: rsvp.plusOnesCount,
  dietaryRequirements: rsvp.dietaryRequirements,
  notes: rsvp.notes,
  updatedAt: rsvp.updatedAt,
};

export class RsvpRepository {
  /** Creates or replaces the single RSVP of an invitation (unique on invitation_id). */
  async upsert(invitationId: string, dto: PutRsvpRequest): Promise<StoredRsvp> {
    const values = {
      attending: dto.attending,
      plusOnesCount: dto.plusOnesCount,
      dietaryRequirements: dto.dietaryRequirements ?? null,
      notes: dto.notes ?? null,
    };
    const [row] = await db
      .insert(rsvp)
      .values({ invitationId, ...values })
      .onConflictDoUpdate({
        target: rsvp.invitationId,
        set: { ...values, updatedAt: new Date() },
      })
      .returning(rsvpColumns);
    return row;
  }

  /** Every invitation with its RSVP (null when unanswered), ordered by guest name. */
  async listAll(): Promise<StoredRsvpRow[]> {
    const rows = await db
      .select({
        invitationId: invitations.id,
        guestName: guests.name,
        maxPlusOnes: invitations.maxPlusOnes,
        rsvp: rsvpColumns,
      })
      .from(invitations)
      .innerJoin(guests, eq(guests.id, invitations.guestId))
      .leftJoin(rsvp, eq(rsvp.invitationId, invitations.id))
      .orderBy(asc(guests.name), asc(invitations.id));
    // A left join yields an all-null rsvp object when the guest hasn't responded yet.
    return rows.map((r) => ({ ...r, rsvp: r.rsvp?.id ? r.rsvp : null }));
  }
}
