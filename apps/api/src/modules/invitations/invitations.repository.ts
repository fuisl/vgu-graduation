import type { CreateInvitationRequest } from "@grad/contract";
import type { AdminInvitationRow } from "@grad/contract";
import { and, desc, eq, inArray } from "drizzle-orm";
import { recordAudit } from "../../audit/audit.js";
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

/** Thrown when a create request names an inviter user id that doesn't exist. */
export class UnknownInviterError extends Error {
  constructor() {
    super("One or more inviters do not exist");
    this.name = "UnknownInviterError";
  }
}

export interface RevokedInvitation {
  id: string;
  revokedAt: Date;
}

export class InvitationsRepository {
  async createInvitation(
    dto: CreateInvitationRequest,
    tokenHash: string,
    actor: string,
  ): Promise<CreatedInvitation> {
    return db.transaction(async (tx) => {
      const inviterIds = [...new Set(dto.inviterUserIds)];
      const found = await tx.select({ id: users.id }).from(users).where(inArray(users.id, inviterIds));
      if (found.length !== inviterIds.length) throw new UnknownInviterError();

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
        .values(inviterIds.map((userId) => ({ invitationId: invitation.id, userId })))
        .onConflictDoNothing();

      await recordAudit(tx, {
        actor,
        action: "invitation.create",
        targetType: "invitation",
        targetId: invitation.id,
        metadata: { guestId: guest.id, inviterUserIds: inviterIds, maxPlusOnes },
      });

      return {
        invitationId: invitation.id,
        guest,
        inviterUserIds: inviterIds,
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

  async rotateTokenHash(invitationId: string, newTokenHash: string, actor: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      const updated = await tx
        .update(invitations)
        .set({ tokenHash: newTokenHash, updatedAt: new Date() })
        .where(and(eq(invitations.id, invitationId), eq(invitations.status, "active")))
        .returning({ id: invitations.id });
      if (updated.length === 0) return false;

      await recordAudit(tx, {
        actor,
        action: "invitation.rotate",
        targetType: "invitation",
        targetId: invitationId,
      });
      return true;
    });
  }

  /** Revokes an invitation. Idempotent: an already revoked one is returned unchanged and not re-audited. */
  async revoke(invitationId: string, actor: string): Promise<RevokedInvitation | null> {
    return db.transaction(async (tx) => {
      const now = new Date();
      const [updated] = await tx
        .update(invitations)
        .set({ status: "revoked", revokedAt: now, updatedAt: now })
        .where(and(eq(invitations.id, invitationId), eq(invitations.status, "active")))
        .returning({ id: invitations.id, revokedAt: invitations.revokedAt });

      if (updated) {
        await recordAudit(tx, {
          actor,
          action: "invitation.revoke",
          targetType: "invitation",
          targetId: invitationId,
        });
        return { id: updated.id, revokedAt: updated.revokedAt ?? now };
      }

      const [existing] = await tx
        .select({ id: invitations.id, revokedAt: invitations.revokedAt, updatedAt: invitations.updatedAt })
        .from(invitations)
        .where(and(eq(invitations.id, invitationId), eq(invitations.status, "revoked")));
      return existing ? { id: existing.id, revokedAt: existing.revokedAt ?? existing.updatedAt } : null;
    });
  }

  /** Every invitation, newest first, with inviters and RSVP. Never selects the token hash. */
  async listForAdmin(): Promise<AdminInvitationRow[]> {
    const rows = await db
      .select({
        id: invitations.id,
        status: invitations.status,
        maxPlusOnes: invitations.maxPlusOnes,
        createdAt: invitations.createdAt,
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
      .orderBy(desc(invitations.createdAt), desc(invitations.id));

    const inviterRows = await db
      .select({
        invitationId: invitationInviters.invitationId,
        id: users.id,
        name: users.name,
        email: users.email,
      })
      .from(invitationInviters)
      .innerJoin(users, eq(users.id, invitationInviters.userId))
      .orderBy(users.name);

    const byInvitation = new Map<string, { id: string; name: string; email: string }[]>();
    for (const { invitationId, ...inviter } of inviterRows) {
      const list = byInvitation.get(invitationId) ?? [];
      list.push(inviter);
      byInvitation.set(invitationId, list);
    }

    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      maxPlusOnes: row.maxPlusOnes,
      createdAt: row.createdAt.toISOString(),
      guest: row.guest,
      inviters: byInvitation.get(row.id) ?? [],
      rsvp: row.rsvp?.id ? { ...row.rsvp, updatedAt: row.rsvp.updatedAt.toISOString() } : null,
    }));
  }
}
