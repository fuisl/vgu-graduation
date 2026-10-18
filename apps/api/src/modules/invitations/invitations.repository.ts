import type { CreateInvitationRequest, UpdateInvitationRequest } from "@grad/contract";
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
import { namesForCreate, namesForUpdate } from "./person-name.js";

export interface StoredGuest {
  id: string;
  name: string;
  givenName: string;
  familyName: string | null;
  email: string | null;
  phone: string | null;
}

export interface StoredInvitation {
  id: string;
  tokenHash: string;
  maxPlusOnes: number;
  status: "active" | "revoked";
  validFrom: Date | null;
  validUntil: Date | null;
  guest: StoredGuest;
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
  guest: StoredGuest;
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

/** Thrown when `maxPlusOnes` would drop below the plus-ones the guest already confirmed. */
export class PlusOnesConflictError extends Error {
  constructor(readonly plusOnesCount: number) {
    super("maxPlusOnes is below the plus-ones already in the RSVP");
    this.name = "PlusOnesConflictError";
  }
}

export interface RevokedInvitation {
  id: string;
  revokedAt: Date;
}

const guestColumns = {
  id: guests.id,
  name: guests.name,
  givenName: guests.givenName,
  familyName: guests.familyName,
  email: guests.email,
  phone: guests.phone,
};

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
        .values({
          name: dto.guestName,
          ...namesForCreate(dto.guestName, dto.guestGivenName, dto.guestFamilyName),
          email: dto.guestEmail ?? null,
          phone: dto.guestPhone ?? null,
        })
        .returning(guestColumns);

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
        guest: guestColumns,
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

  /**
   * Edits the guest and invitation behind `invitationId` (PATCH /admin/invitations/{id}).
   * Returns null for an unknown id. Audited with the changed field names only:
   * names, emails and phone numbers are PII.
   */
  async update(invitationId: string, dto: UpdateInvitationRequest, actor: string): Promise<AdminInvitationRow | null> {
    const found = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ guestId: invitations.guestId, plusOnesCount: rsvp.plusOnesCount })
        .from(invitations)
        .leftJoin(rsvp, eq(rsvp.invitationId, invitations.id))
        .where(eq(invitations.id, invitationId))
        .for("update", { of: invitations });
      if (!current) return false;

      const guestSet: Partial<typeof guests.$inferInsert> = namesForUpdate({
        name: dto.guestName,
        givenName: dto.guestGivenName,
        familyName: dto.guestFamilyName,
        nameReviewed: dto.nameReviewed,
      });
      if (dto.guestEmail !== undefined) guestSet.email = dto.guestEmail;
      if (dto.guestPhone !== undefined) guestSet.phone = dto.guestPhone;

      if (dto.maxPlusOnes !== undefined) {
        if (current.plusOnesCount !== null && current.plusOnesCount > dto.maxPlusOnes) {
          throw new PlusOnesConflictError(current.plusOnesCount);
        }
        await tx
          .update(invitations)
          .set({ maxPlusOnes: dto.maxPlusOnes, updatedAt: new Date() })
          .where(eq(invitations.id, invitationId));
      }
      if (Object.keys(guestSet).length > 0) {
        await tx
          .update(guests)
          .set({ ...guestSet, updatedAt: new Date() })
          .where(eq(guests.id, current.guestId));
      }

      await recordAudit(tx, {
        actor,
        action: "invitation.update",
        targetType: "invitation",
        targetId: invitationId,
        metadata: { fields: Object.keys(dto).sort() },
      });
      return true;
    });
    if (!found) return null;
    const [row] = await this.listForAdmin(invitationId);
    return row ?? null;
  }

  /** Every invitation (or one), newest first, with inviters and RSVP. Never selects the token hash. */
  async listForAdmin(onlyId?: string): Promise<AdminInvitationRow[]> {
    const rows = await db
      .select({
        id: invitations.id,
        status: invitations.status,
        maxPlusOnes: invitations.maxPlusOnes,
        createdAt: invitations.createdAt,
        guest: { ...guestColumns, nameReviewed: guests.nameReviewed },
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
      .where(onlyId ? eq(invitations.id, onlyId) : undefined)
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
      .where(onlyId ? eq(invitationInviters.invitationId, onlyId) : undefined)
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

  /** Whether an invitation with this id exists (any status). */
  async exists(invitationId: string): Promise<boolean> {
    const [row] = await db.select({ id: invitations.id }).from(invitations).where(eq(invitations.id, invitationId));
    return Boolean(row);
  }
}
