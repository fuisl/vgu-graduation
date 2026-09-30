import type { ModerationStatus } from "@grad/contract";
import { and, count, desc, eq, gte, sql, type SQL } from "drizzle-orm";
import { recordAudit } from "../../audit/audit.js";
import { db } from "../../db/index.js";
import { wishes } from "../../db/schema.js";

export interface StoredWish {
  id: string;
  authorName: string;
  body: string;
  moderationStatus: ModerationStatus;
  createdAt: Date;
}

export type ModerateResult =
  | { status: "ok"; wish: StoredWish; changed: boolean }
  | { status: "not_found" };

const columns = {
  id: wishes.id,
  authorName: wishes.authorName,
  body: wishes.body,
  moderationStatus: wishes.moderationStatus,
  createdAt: wishes.createdAt,
};

export class WishesRepository {
  async create(invitationId: string, authorName: string, body: string): Promise<StoredWish> {
    const [row] = await db.insert(wishes).values({ invitationId, authorName, body }).returning(columns);
    return row;
  }

  /** Wishes this invitation wrote at or after `since`, for the per-invitation write cap. */
  async countSince(invitationId: string, since: Date): Promise<number> {
    const [row] = await db
      .select({ n: count() })
      .from(wishes)
      .where(and(eq(wishes.invitationId, invitationId), gte(wishes.createdAt, since)));
    return row?.n ?? 0;
  }

  /**
   * One page, newest first (ties broken by id). `visibleOnly` is the public
   * listing; admins see every state. Fetches `limit + 1` so the caller can tell
   * whether another page exists. `afterId` is the last wish of the previous
   * page; comparing against its stored row keeps Postgres' microsecond
   * timestamps exact (a JS Date would round them to milliseconds).
   */
  async list(options: { limit: number; afterId?: string; visibleOnly: boolean }): Promise<StoredWish[]> {
    const filters: SQL[] = [];
    if (options.visibleOnly) filters.push(eq(wishes.moderationStatus, "visible"));
    if (options.afterId) {
      filters.push(
        sql`(${wishes.createdAt}, ${wishes.id}) < (SELECT c.created_at, c.id FROM wishes c WHERE c.id = ${options.afterId})`,
      );
    }
    return db
      .select(columns)
      .from(wishes)
      .where(and(...filters))
      .orderBy(desc(wishes.createdAt), desc(wishes.id))
      .limit(options.limit + 1);
  }

  /**
   * Sets the moderation state and audits it in one transaction. Setting the
   * state a wish already has is a no-op: returned unchanged and not re-audited.
   */
  async moderate(id: string, status: ModerationStatus, actor: string): Promise<ModerateResult> {
    return db.transaction(async (tx) => {
      const [current] = await tx.select(columns).from(wishes).where(eq(wishes.id, id)).for("update");
      if (!current) return { status: "not_found" } as const;
      if (current.moderationStatus === status) return { status: "ok", wish: current, changed: false } as const;

      const [updated] = await tx
        .update(wishes)
        .set({ moderationStatus: status, updatedAt: sql`now()` })
        .where(eq(wishes.id, id))
        .returning(columns);
      await recordAudit(tx, {
        actor,
        action: "wish.moderate",
        targetType: "wish",
        targetId: id,
        metadata: { from: current.moderationStatus, to: status },
      });
      return { status: "ok", wish: updated, changed: true } as const;
    });
  }
}
