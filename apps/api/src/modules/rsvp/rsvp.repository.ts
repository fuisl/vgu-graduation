import { type AccessibilityNeeds, hasAccessibilityNeeds, type PutRsvpRequest } from "@grad/contract";
import { asc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { guests, invitations, rsvp, rsvpAccessibility } from "../../db/schema.js";

export interface StoredRsvp {
  id: string;
  attending: boolean;
  plusOnesCount: number;
  dietaryRequirements: string | null;
  notes: string | null;
  updatedAt: Date;
}

/** The guest's own view: their RSVP plus their accessibility needs (sensitive, #176). */
export interface StoredGuestRsvp extends StoredRsvp {
  accessibility: AccessibilityNeeds | null;
}

export interface StoredRsvpRow {
  invitationId: string;
  guestName: string;
  maxPlusOnes: number;
  rsvp: StoredRsvp | null;
}

export interface StoredAccessibilityRow {
  invitationId: string;
  guestName: string;
  attending: boolean;
  plusOnesCount: number;
  accessibility: AccessibilityNeeds;
  updatedAt: Date;
}

const rsvpColumns = {
  id: rsvp.id,
  attending: rsvp.attending,
  plusOnesCount: rsvp.plusOnesCount,
  dietaryRequirements: rsvp.dietaryRequirements,
  notes: rsvp.notes,
  updatedAt: rsvp.updatedAt,
};

const accessibilityColumns = {
  rsvpId: rsvpAccessibility.rsvpId,
  wheelchair: rsvpAccessibility.wheelchair,
  stepFreeAccess: rsvpAccessibility.stepFreeAccess,
  captions: rsvpAccessibility.captions,
  seatNearSpeakers: rsvpAccessibility.seatNearSpeakers,
  largePrint: rsvpAccessibility.largePrint,
  visionAssistance: rsvpAccessibility.visionAssistance,
  seatNearFront: rsvpAccessibility.seatNearFront,
  aisleSeat: rsvpAccessibility.aisleSeat,
  companion: rsvpAccessibility.companion,
  note: rsvpAccessibility.note,
};

type AccessibilityRow = { rsvpId: string | null } & { [K in keyof AccessibilityNeeds]: AccessibilityNeeds[K] | null };

/** A left-joined accessibility row, or null when there is none. */
function toNeeds(row: AccessibilityRow | null): AccessibilityNeeds | null {
  if (!row?.rsvpId) return null;
  const { rsvpId: _rsvpId, ...needs } = row;
  return needs as AccessibilityNeeds;
}

export class RsvpRepository {
  /**
   * Creates or replaces the single RSVP of an invitation (unique on invitation_id).
   * `dto.accessibility`: undefined keeps the stored needs, null or an empty
   * object deletes them, anything else replaces them, in the same transaction.
   */
  async upsert(invitationId: string, dto: PutRsvpRequest): Promise<StoredGuestRsvp> {
    const values = {
      attending: dto.attending,
      plusOnesCount: dto.plusOnesCount,
      dietaryRequirements: dto.dietaryRequirements ?? null,
      notes: dto.notes ?? null,
    };
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(rsvp)
        .values({ invitationId, ...values })
        .onConflictDoUpdate({
          target: rsvp.invitationId,
          set: { ...values, updatedAt: new Date() },
        })
        .returning(rsvpColumns);

      if (dto.accessibility !== undefined) {
        const needs = dto.accessibility && { ...dto.accessibility, note: dto.accessibility.note || null };
        if (needs && hasAccessibilityNeeds(needs)) {
          await tx
            .insert(rsvpAccessibility)
            .values({ rsvpId: row.id, ...needs })
            .onConflictDoUpdate({ target: rsvpAccessibility.rsvpId, set: { ...needs, updatedAt: new Date() } });
        } else {
          await tx.delete(rsvpAccessibility).where(eq(rsvpAccessibility.rsvpId, row.id));
        }
      }

      const [stored] = await tx
        .select(accessibilityColumns)
        .from(rsvpAccessibility)
        .where(eq(rsvpAccessibility.rsvpId, row.id));
      return { ...row, accessibility: toNeeds(stored ?? null) };
    });
  }

  /** The invitation's RSVP with its accessibility needs, or null before the guest answers. */
  async findForInvitation(invitationId: string): Promise<StoredGuestRsvp | null> {
    const [row] = await db
      .select({ rsvp: rsvpColumns, accessibility: accessibilityColumns })
      .from(rsvp)
      .leftJoin(rsvpAccessibility, eq(rsvpAccessibility.rsvpId, rsvp.id))
      .where(eq(rsvp.invitationId, invitationId));
    if (!row) return null;
    return { ...row.rsvp, accessibility: toNeeds(row.accessibility) };
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

  /** RSVPs on active invitations that state any accessibility need, by guest name. Admin only. */
  async listAccessibility(): Promise<StoredAccessibilityRow[]> {
    const rows = await db
      .select({
        invitationId: invitations.id,
        guestName: guests.name,
        attending: rsvp.attending,
        plusOnesCount: rsvp.plusOnesCount,
        accessibility: accessibilityColumns,
        updatedAt: rsvpAccessibility.updatedAt,
      })
      .from(rsvpAccessibility)
      .innerJoin(rsvp, eq(rsvp.id, rsvpAccessibility.rsvpId))
      .innerJoin(invitations, eq(invitations.id, rsvp.invitationId))
      .innerJoin(guests, eq(guests.id, invitations.guestId))
      .where(eq(invitations.status, "active"))
      .orderBy(asc(guests.name), asc(invitations.id));
    return rows.map((r) => ({ ...r, accessibility: toNeeds(r.accessibility)! }));
  }
}
