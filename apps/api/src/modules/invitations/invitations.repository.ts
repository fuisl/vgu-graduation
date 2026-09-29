import type { CreateInvitationRequest } from "@grad/contract";
import { eq, and } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  guests,
  invitationInviters,
  invitations,
  rsvp,
  users,
} from "../../db/schema.js";

export interface StoredInvitation {
  id: string;
  tokenHash: string;
  maxPlusOnes: number;
  status: "active" | "revoked";
  validFrom: Date | null;
  validUntil: Date | null;
  guest: { id: string; name: string; email: string | null; phone: string | null };
  inviters: { id: string; name: string; email: string }[];
  rsvp: {
    id: string;
    attending: boolean;
    plusOnesCount: number;
    dietaryRequirements: string | null;
    notes: string | null;
    updatedAt: Date;
  } | null;
}

export interface CreatedInvitation {
  invitationId: string;
  guest: { id: string; name: string; email: string | null; phone: string | null };
  inviterUserIds: string[];
  maxPlusOnes: number;
}

export class InvitationsRepository {
  async createInvitation(dto: CreateInvitationRequest, tokenHash: string): Promise<CreatedInvitation> {
    return db.transaction(async (tx) => {
      const [guest] = await tx
        .insert(guests)
        .values({ name: dto.guestName, email: dto.guestEmail ?? null, phone: dto.guestPhone ?? null })
        .returning({ id: guests.id, name: guests.name, email: guests.email, phone: guests.phone });

      const maxPlusOnes = dto.maxPlusOnes ?? 0;
      const [invitation] = await tx
        .insert(invitations)
        .values({ guestId: guest.id, tokenHash, maxPlusOnes })
        .returning({ id: invitations.id });

      await tx
        .insert(invitationInviters)
        .values(dto.inviterUserIds.map((userId) => ({ invitationId: invitation.id, userId })))
        .onConflictDoNothing();

      return {
        invitationId: invitation.id,
        guest,
        inviterUserIds: dto.inviterUserIds,
        maxPlusOnes,
      };
    });
  }

  async findByTokenHash(tokenHash: string): Promise<StoredInvitation | null> {
    const [row] = await db
      .select({
        id: invitations.id,
        tokenHash: invitations.tokenHash,
        maxPlusOnes: invitations.maxPlusOnes,
        status: invitations.status,
        validFrom: invitations.validFrom,
        validUntil: invitations.validUntil,
        guest: { id: guests.id, name: guests.name, email: guests.email, phone: guests.phone },
        rsvp: {
          id: rsvp.id,
          attending: rsvp.attending,
          plusOnesCount: rsvp.plusOnesCount,
          dietaryRequirements: rsvp.dietaryRequirements,
          notes: rsvp.notes,
          updatedAt: rsvp.updatedAt,
        },
      })
      .from(invitations)
      .innerJoin(guests, eq(guests.id, invitations.guestId))
      .leftJoin(rsvp, eq(rsvp.invitationId, invitations.id))
      .where(eq(invitations.tokenHash, tokenHash));

    if (!row) return null;

    const inviters = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(invitationInviters)
      .innerJoin(users, eq(users.id, invitationInviters.userId))
      .where(eq(invitationInviters.invitationId, row.id));

    // A left join yields an all-null rsvp object when the guest hasn't responded yet.
    return { ...row, rsvp: row.rsvp?.id ? row.rsvp : null, inviters };
  }

  async rotateTokenHash(invitationId: string, newTokenHash: string): Promise<boolean> {
    const updated = await db
      .update(invitations)
      .set({ tokenHash: newTokenHash, updatedAt: new Date() })
      .where(and(eq(invitations.id, invitationId), eq(invitations.status, "active")))
      .returning({ id: invitations.id });
    return updated.length > 0;
  }
}
