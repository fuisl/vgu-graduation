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
  isPublic: boolean;
  createdAt: Date;
}

export type ModerateResult =
  | { status: "ok"; wish: StoredWish; changed: boolean }
  | { status: "not_found" };

export type SetWishPublicResult =
  | { status: "ok"; wish: StoredWish; changed: boolean }
  | { status: "not_eligible"; wish: StoredWish }
  | { status: "not_found" };

export interface ListWishesOptions {
  limit: number;
  afterId?: string;
  /** The public listing: `visible` only. Admins see every state. */
  visibleOnly: boolean;
  /** The curated public set (#75): flagged by a moderator, and still visible. */
  publicOnly?: boolean;
  /** Admin filters (#64). */
  status?: ModerationStatus;
  isPublic?: boolean;
}

const columns = {
  id: wishes.id,
  authorName: wishes.authorName,
  body: wishes.body,
  moderationStatus: wishes.moderationStatus,
  isPublic: wishes.isPublic,
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
   * One page, newest first (ties broken by id). Fetches `limit + 1` so the
   * caller can tell whether another page exists. `afterId` is the last wish of
   * the previous page; comparing against its stored row keeps Postgres'
   * microsecond timestamps exact (a JS Date would round them to milliseconds).
   */
  async list(options: ListWishesOptions): Promise<StoredWish[]> {
    const filters: SQL[] = [];
    if (options.visibleOnly || options.publicOnly) filters.push(eq(wishes.moderationStatus, "visible"));
    if (options.publicOnly) filters.push(eq(wishes.isPublic, true));
    if (options.status) filters.push(eq(wishes.moderationStatus, options.status));
    if (options.isPublic !== undefined) filters.push(eq(wishes.isPublic, options.isPublic));
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

  /**
   * Flags or un-flags a wish for the curated public set (#75). Flagging needs a
   * visible wish. Audited as `wish.public` when it changes.
   */
  async setPublic(id: string, isPublic: boolean, actor: string): Promise<SetWishPublicResult> {
    return db.transaction(async (tx) => {
      const [current] = await tx.select(columns).from(wishes).where(eq(wishes.id, id)).for("update");
      if (!current) return { status: "not_found" } as const;
      if (current.isPublic === isPublic) return { status: "ok", wish: current, changed: false } as const;
      if (isPublic && current.moderationStatus !== "visible") return { status: "not_eligible", wish: current } as const;

      const [updated] = await tx
        .update(wishes)
        .set({ isPublic, updatedAt: sql`now()` })
        .where(eq(wishes.id, id))
        .returning(columns);
      await recordAudit(tx, {
        actor,
        action: "wish.public",
        targetType: "wish",
        targetId: id,
        metadata: { from: current.isPublic, to: isPublic },
      });
      return { status: "ok", wish: updated, changed: true } as const;
    });
  }
}
