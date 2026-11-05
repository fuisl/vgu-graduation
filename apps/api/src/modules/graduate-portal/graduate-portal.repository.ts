import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { recordAudit } from "../../audit/audit.js";
import { db } from "../../db/index.js";
import {
  graduateSessions,
  graduateSignInTokens,
  guests,
  invitationInviters,
  invitations,
  rsvp,
  users,
} from "../../db/schema.js";
import { revokeInvitationInTransaction } from "../invitations/invitations.repository.js";

/** Audit actor for what a graduate does in the portal: their user id, never a name or address. */
export function portalActor(graduateId: string): string {
  return `graduate:${graduateId}`;
}

export interface PortalGraduate {
  sessionId: string;
  id: string;
  name: string;
  givenName: string;
  joinCode: string | null;
}

export interface StoredPortalGuest {
  id: string;
  name: string;
  email: string | null;
  attending: boolean | null;
  answeredAt: Date | null;
  soleInviter: boolean;
}

export type RemoveGuestOutcome = "revoked" | "unlinked";

export interface GraduatePortalStore {
  issueSignInToken(input: { graduateId: string; tokenHash: string; expiresAt: Date; now: Date }): Promise<void>;
  signIn(input: { signInHash: string; sessionHash: string; sessionExpiresAt: Date; now: Date }): Promise<string | null>;
  findSession(sessionHash: string, now: Date): Promise<PortalGraduate | null>;
  revokeSession(sessionId: string, graduateId: string, now: Date): Promise<void>;
  listGuests(graduateId: string): Promise<StoredPortalGuest[]>;
  removeGuest(graduateId: string, invitationId: string): Promise<RemoveGuestOutcome | null>;
}

/**
 * Reads and writes for the graduate portal (ADR-017). Nothing here touches `users.join_code` or
 * `invitations.token_hash`: join links and invitation links people already hold keep working.
 * Guest queries always start from `invitation_inviters`, so a graduate only reaches their own guests.
 */
export class GraduatePortalRepository implements GraduatePortalStore {
  /** Stores a sign-in token's hash, and clears this graduate's expired ones as it goes. */
  async issueSignInToken(input: { graduateId: string; tokenHash: string; expiresAt: Date; now: Date }): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .delete(graduateSignInTokens)
        .where(and(eq(graduateSignInTokens.userId, input.graduateId), lt(graduateSignInTokens.expiresAt, input.now)));
      await tx.insert(graduateSignInTokens).values({ userId: input.graduateId, tokenHash: input.tokenHash, expiresAt: input.expiresAt });
    });
  }

  /**
   * Spends a sign-in token and opens a session, in one transaction. The UPDATE's WHERE makes it
   * single use even with simultaneous requests. Null for an unknown, used or expired token.
   */
  async signIn(input: { signInHash: string; sessionHash: string; sessionExpiresAt: Date; now: Date }): Promise<string | null> {
    return db.transaction(async (tx) => {
      const [spent] = await tx
        .update(graduateSignInTokens)
        .set({ consumedAt: input.now })
        .where(
          and(
            eq(graduateSignInTokens.tokenHash, input.signInHash),
            isNull(graduateSignInTokens.consumedAt),
            gt(graduateSignInTokens.expiresAt, input.now),
          ),
        )
        .returning({ userId: graduateSignInTokens.userId });
      if (!spent) return null;

      const [graduate] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, spent.userId), eq(users.role, "graduate")));
      if (!graduate) return null;

      await tx
        .delete(graduateSessions)
        .where(and(eq(graduateSessions.userId, graduate.id), lt(graduateSessions.expiresAt, input.now)));
      const [session] = await tx
        .insert(graduateSessions)
        .values({ userId: graduate.id, tokenHash: input.sessionHash, expiresAt: input.sessionExpiresAt })
        .returning({ id: graduateSessions.id });
      await recordAudit(tx, {
        actor: portalActor(graduate.id),
        action: "graduate.portal_sign_in",
        targetType: "graduate",
        targetId: graduate.id,
        metadata: { sessionId: session.id },
      });
      return graduate.id;
    });
  }

  /** The graduate behind a live session: not revoked, not expired, and still a graduate. */
  async findSession(sessionHash: string, now: Date): Promise<PortalGraduate | null> {
    const [row] = await db
      .select({
        sessionId: graduateSessions.id,
        id: users.id,
        name: users.name,
        givenName: users.givenName,
        joinCode: users.joinCode,
      })
      .from(graduateSessions)
      .innerJoin(users, eq(users.id, graduateSessions.userId))
      .where(
        and(
          eq(graduateSessions.tokenHash, sessionHash),
          isNull(graduateSessions.revokedAt),
          gt(graduateSessions.expiresAt, now),
          eq(users.role, "graduate"),
        ),
      );
    return row ?? null;
  }

  async revokeSession(sessionId: string, graduateId: string, now: Date): Promise<void> {
    await db.transaction(async (tx) => {
      const revoked = await tx
        .update(graduateSessions)
        .set({ revokedAt: now })
        .where(and(eq(graduateSessions.id, sessionId), isNull(graduateSessions.revokedAt)))
        .returning({ id: graduateSessions.id });
      if (revoked.length === 0) return;
      await recordAudit(tx, {
        actor: portalActor(graduateId),
        action: "graduate.portal_sign_out",
        targetType: "graduate",
        targetId: graduateId,
        metadata: { sessionId },
      });
    });
  }

  /** This graduate's guests with an active invitation, newest first. Selects only what the dashboard shows. */
  async listGuests(graduateId: string): Promise<StoredPortalGuest[]> {
    return db
      .select({
        id: invitations.id,
        name: guests.name,
        email: guests.email,
        attending: rsvp.attending,
        answeredAt: rsvp.updatedAt,
        soleInviter: sql<boolean>`(
          SELECT count(*) = 1 FROM ${invitationInviters} other
          WHERE other.invitation_id = ${invitations.id}
        )`,
      })
      .from(invitationInviters)
      .innerJoin(invitations, eq(invitations.id, invitationInviters.invitationId))
      .innerJoin(guests, eq(guests.id, invitations.guestId))
      .leftJoin(rsvp, eq(rsvp.invitationId, invitations.id))
      .where(and(eq(invitationInviters.userId, graduateId), eq(invitations.status, "active")))
      .orderBy(desc(invitations.createdAt), desc(invitations.id));
  }

  /**
   * Takes this graduate off a guest's inviters (ADR-017). If nobody is left, revokes the invitation
   * the way an admin would, so its link stops working; the RSVP stays. Otherwise the invitation is
   * untouched. The token hash is never written. Null unless the guest is on this graduate's list.
   *
   * The address lock is the one registration takes (JoinRepository.register), so a simultaneous
   * join can't add a co-inviter to an invitation this is revoking; the row lock serialises two
   * graduates removing the same guest, so the last one out always revokes.
   */
  async removeGuest(graduateId: string, invitationId: string): Promise<RemoveGuestOutcome | null> {
    return db.transaction(async (tx) => {
      const [linked] = await tx
        .select({ email: guests.email })
        .from(invitationInviters)
        .innerJoin(invitations, eq(invitations.id, invitationInviters.invitationId))
        .innerJoin(guests, eq(guests.id, invitations.guestId))
        .where(
          and(
            eq(invitationInviters.userId, graduateId),
            eq(invitationInviters.invitationId, invitationId),
            eq(invitations.status, "active"),
          ),
        );
      if (!linked) return null;

      if (linked.email) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`join:${linked.email.toLowerCase()}`}))`);
      }
      const [current] = await tx
        .select({ status: invitations.status })
        .from(invitations)
        .where(eq(invitations.id, invitationId))
        .for("update");
      if (current?.status !== "active") return null;

      const removed = await tx
        .delete(invitationInviters)
        .where(and(eq(invitationInviters.invitationId, invitationId), eq(invitationInviters.userId, graduateId)))
        .returning({ userId: invitationInviters.userId });
      if (removed.length === 0) return null;

      const remaining = await tx
        .select({ userId: invitationInviters.userId })
        .from(invitationInviters)
        .where(eq(invitationInviters.invitationId, invitationId));
      const actor = portalActor(graduateId);
      const outcome: RemoveGuestOutcome = remaining.length === 0 ? "revoked" : "unlinked";
      await recordAudit(tx, {
        actor,
        action: "invitation.graduate_remove_inviter",
        targetType: "invitation",
        targetId: invitationId,
        metadata: { inviterUserId: graduateId, outcome },
      });
      if (outcome === "revoked") await revokeInvitationInTransaction(tx, invitationId, actor);
      return outcome;
    });
  }
}
