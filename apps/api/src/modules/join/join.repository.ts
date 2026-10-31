import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { recordAudit } from "../../audit/audit.js";
import { db } from "../../db/index.js";
import { guests, invitationInviters, invitations, users } from "../../db/schema.js";
import { namesForCreate } from "../invitations/person-name.js";

/** Audit actor for writes made through a join link: no admin is involved. */
export const JOIN_ACTOR = "join-link";

export interface JoinGraduate {
  id: string;
  name: string;
  givenName: string;
}

export interface GraduateForLink extends JoinGraduate {
  email: string;
  joinCode: string | null;
}

export type RegisterResult =
  | { kind: "created"; invitationId: string; guestId: string; givenName: string }
  | { kind: "existing"; invitationId: string };

export interface JoinStore {
  findGraduateByCode(code: string): Promise<JoinGraduate | null>;
  findGraduateByEmail(email: string): Promise<GraduateForLink | null>;
  ensureJoinCode(graduateId: string, candidate: string): Promise<string>;
  rotateJoinCode(graduateId: string, code: string, actor: string): Promise<boolean>;
  register(input: { graduateId: string; name: string; email: string; tokenHash: string }): Promise<RegisterResult>;
  discard(input: { invitationId: string; guestId: string; graduateId: string }): Promise<void>;
}

const graduateColumns = { id: users.id, name: users.name, givenName: users.givenName };

export class JoinRepository implements JoinStore {
  async findGraduateByCode(code: string): Promise<JoinGraduate | null> {
    const [row] = await db
      .select(graduateColumns)
      .from(users)
      .where(and(eq(users.joinCode, code), eq(users.role, "graduate")));
    return row ?? null;
  }

  /** Graduate emails are stored lowercased (createGraduateRequestSchema), and so is the lookup. */
  async findGraduateByEmail(email: string): Promise<GraduateForLink | null> {
    const [row] = await db
      .select({ ...graduateColumns, email: users.email, joinCode: users.joinCode })
      .from(users)
      .where(and(eq(users.email, email), eq(users.role, "graduate")));
    return row ?? null;
  }

  /** The graduate's join code, storing `candidate` if they have none yet. Two racing requests settle on one code. */
  async ensureJoinCode(graduateId: string, candidate: string): Promise<string> {
    return db.transaction(async (tx) => {
      const [set] = await tx
        .update(users)
        .set({ joinCode: candidate, updatedAt: new Date() })
        .where(and(eq(users.id, graduateId), isNull(users.joinCode)))
        .returning({ joinCode: users.joinCode });
      if (set?.joinCode) {
        await recordAudit(tx, { actor: JOIN_ACTOR, action: "graduate.join_link_issue", targetType: "graduate", targetId: graduateId });
        return set.joinCode;
      }
      const [row] = await tx.select({ joinCode: users.joinCode }).from(users).where(eq(users.id, graduateId));
      if (!row?.joinCode) throw new Error("graduate disappeared while issuing a join code");
      return row.joinCode;
    });
  }

  /** Replaces a graduate's join code (admin). False for an unknown id or a non-graduate. */
  async rotateJoinCode(graduateId: string, code: string, actor: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      const updated = await tx
        .update(users)
        .set({ joinCode: code, updatedAt: new Date() })
        .where(and(eq(users.id, graduateId), eq(users.role, "graduate")))
        .returning({ id: users.id });
      if (updated.length === 0) return false;
      await recordAudit(tx, { actor, action: "graduate.join_link_rotate", targetType: "graduate", targetId: graduateId });
      return true;
    });
  }

  /**
   * Registers a guest through a graduate's join link. An address that already has an active
   * invitation is not invited twice: the graduate joins it as a co-inviter. A transaction-scoped
   * advisory lock on the address keeps two simultaneous submissions from creating two invitations.
   * Audited with ids only.
   */
  async register(input: { graduateId: string; name: string; email: string; tokenHash: string }): Promise<RegisterResult> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`join:${input.email}`}))`);

      const [existing] = await tx
        .select({ id: invitations.id })
        .from(invitations)
        .innerJoin(guests, eq(guests.id, invitations.guestId))
        .where(and(eq(invitations.status, "active"), sql`lower(${guests.email}) = ${input.email}`))
        .orderBy(desc(invitations.createdAt))
        .limit(1);
      if (existing) {
        const added = await tx
          .insert(invitationInviters)
          .values({ invitationId: existing.id, userId: input.graduateId })
          .onConflictDoNothing()
          .returning({ invitationId: invitationInviters.invitationId });
        if (added.length > 0) {
          await recordAudit(tx, {
            actor: JOIN_ACTOR,
            action: "invitation.join_add_inviter",
            targetType: "invitation",
            targetId: existing.id,
            metadata: { inviterUserId: input.graduateId },
          });
        }
        return { kind: "existing", invitationId: existing.id };
      }

      const [guest] = await tx
        .insert(guests)
        .values({ name: input.name, ...namesForCreate(input.name), email: input.email })
        .returning({ id: guests.id, givenName: guests.givenName });
      const [invitation] = await tx
        .insert(invitations)
        .values({ guestId: guest.id, tokenHash: input.tokenHash, maxPlusOnes: 0 })
        .returning({ id: invitations.id });
      await tx.insert(invitationInviters).values({ invitationId: invitation.id, userId: input.graduateId });
      await recordAudit(tx, {
        actor: JOIN_ACTOR,
        action: "invitation.join_create",
        targetType: "invitation",
        targetId: invitation.id,
        metadata: { guestId: guest.id, inviterUserId: input.graduateId },
      });
      return { kind: "created", invitationId: invitation.id, guestId: guest.id, givenName: guest.givenName };
    });
  }

  /**
   * Removes a registration whose invitation email could not be sent. The token went nowhere, so
   * nothing can use the invitation; dropping it lets the guest simply try again.
   */
  async discard(input: { invitationId: string; guestId: string; graduateId: string }): Promise<void> {
    await db.transaction(async (tx) => {
      // Deleting the guest cascades to the invitation and its inviters.
      await tx.delete(guests).where(eq(guests.id, input.guestId));
      await recordAudit(tx, {
        actor: JOIN_ACTOR,
        action: "invitation.join_discard",
        targetType: "invitation",
        targetId: input.invitationId,
        metadata: { inviterUserId: input.graduateId, reason: "email_not_sent" },
      });
    });
  }
}
