import type { CreateGuideItemRequest, GuideCategory, UpdateGuideItemRequest } from "@grad/contract";
import { and, asc, eq, inArray } from "drizzle-orm";
import { recordAudit } from "../../audit/audit.js";
import { db } from "../../db/index.js";
import { guideItems, invitationGuideItems, invitations } from "../../db/schema.js";

export interface StoredGuideItem {
  id: string;
  title: string;
  category: GuideCategory;
  description: string;
  mapUrl: string | null;
  timeHint: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type SetSelectionResult = { status: "ok" } | { status: "not_found" } | { status: "unknown_items" };

const columns = {
  id: guideItems.id,
  title: guideItems.title,
  category: guideItems.category,
  description: guideItems.description,
  mapUrl: guideItems.mapUrl,
  timeHint: guideItems.timeHint,
  sortOrder: guideItems.sortOrder,
  active: guideItems.active,
  createdAt: guideItems.createdAt,
  updatedAt: guideItems.updatedAt,
};

const order = [asc(guideItems.sortOrder), asc(guideItems.title), asc(guideItems.id)];

/** Guest guide-book (#140): the catalogue and per-invitation picks. Every admin write is audited (ids only). */
export class GuideRepository {
  async listItems(options: { activeOnly: boolean }): Promise<StoredGuideItem[]> {
    return db
      .select(columns)
      .from(guideItems)
      .where(options.activeOnly ? eq(guideItems.active, true) : undefined)
      .orderBy(...order);
  }

  async createItem(dto: CreateGuideItemRequest, actor: string): Promise<StoredGuideItem> {
    return db.transaction(async (tx) => {
      const [row] = await tx.insert(guideItems).values(dto).returning(columns);
      await recordAudit(tx, { actor, action: "guide.item.create", targetType: "guide_item", targetId: row.id });
      return row;
    });
  }

  async updateItem(id: string, dto: UpdateGuideItemRequest, actor: string): Promise<StoredGuideItem | null> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(guideItems)
        .set({ ...dto, updatedAt: new Date() })
        .where(eq(guideItems.id, id))
        .returning(columns);
      if (!row) return null;
      await recordAudit(tx, {
        actor,
        action: "guide.item.update",
        targetType: "guide_item",
        targetId: id,
        metadata: { fields: Object.keys(dto).sort() },
      });
      return row;
    });
  }

  /** Deletes an item and every pick of it (cascade). False when unknown. */
  async deleteItem(id: string, actor: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      const deleted = await tx.delete(guideItems).where(eq(guideItems.id, id)).returning({ id: guideItems.id });
      if (deleted.length === 0) return false;
      await recordAudit(tx, { actor, action: "guide.item.delete", targetType: "guide_item", targetId: id });
      return true;
    });
  }

  /** The item ids picked for an invitation (active or not), or null when the invitation is unknown. */
  async selection(invitationId: string): Promise<string[] | null> {
    const [invitation] = await db.select({ id: invitations.id }).from(invitations).where(eq(invitations.id, invitationId));
    if (!invitation) return null;
    const rows = await db
      .select({ id: invitationGuideItems.guideItemId })
      .from(invitationGuideItems)
      .innerJoin(guideItems, eq(guideItems.id, invitationGuideItems.guideItemId))
      .where(eq(invitationGuideItems.invitationId, invitationId))
      .orderBy(...order);
    return rows.map((r) => r.id);
  }

  /** Replaces an invitation's picks; an empty list means the defaults again. */
  async setSelection(invitationId: string, itemIds: string[], actor: string): Promise<SetSelectionResult> {
    const ids = [...new Set(itemIds)];
    return db.transaction(async (tx) => {
      const [invitation] = await tx
        .select({ id: invitations.id })
        .from(invitations)
        .where(eq(invitations.id, invitationId))
        .for("update");
      if (!invitation) return { status: "not_found" } as const;
      if (ids.length > 0) {
        const found = await tx.select({ id: guideItems.id }).from(guideItems).where(inArray(guideItems.id, ids));
        if (found.length !== ids.length) return { status: "unknown_items" } as const;
      }
      await tx.delete(invitationGuideItems).where(eq(invitationGuideItems.invitationId, invitationId));
      if (ids.length > 0) {
        await tx.insert(invitationGuideItems).values(ids.map((guideItemId) => ({ invitationId, guideItemId })));
      }
      await recordAudit(tx, {
        actor,
        action: "invitation.guide.set",
        targetType: "invitation",
        targetId: invitationId,
        metadata: { count: ids.length },
      });
      return { status: "ok" } as const;
    });
  }

  /** The active items picked for an invitation, in catalogue order (empty when none are). */
  async selectedActiveItems(invitationId: string): Promise<StoredGuideItem[]> {
    return db
      .select(columns)
      .from(invitationGuideItems)
      .innerJoin(guideItems, eq(guideItems.id, invitationGuideItems.guideItemId))
      .where(and(eq(invitationGuideItems.invitationId, invitationId), eq(guideItems.active, true)))
      .orderBy(...order);
  }
}
