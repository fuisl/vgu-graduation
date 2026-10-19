import type { AdminMediaQuery, ModerationStatus } from "@grad/contract";
import { and, count, desc, eq, type SQL, sql } from "drizzle-orm";
import { recordAudit } from "../../audit/audit.js";
import { db } from "../../db/index.js";
import { invitations, jobs, photos } from "../../db/schema.js";

/** Job type of derivative generation (#59). Payload: `{ photoId }`, ids only. */
export const DERIVE_JOB = "media.derive";

export interface NewPhoto {
  id: string;
  publicId: string;
  invitationId: string;
  originalKey: string;
  contentType: string;
  sizeBytes: number;
}

export interface PhotoForDerivation {
  id: string;
  publicId: string;
  originalKey: string;
  processingStatus: "pending" | "ready" | "failed";
  moderationStatus: "visible" | "hidden" | "removed";
}

export interface StoredGalleryItem {
  publicId: string;
  width: number | null;
  height: number | null;
  createdAt: Date;
}

export type CreatePhotoResult =
  | { status: "ok"; publicId: string; shotsUsed: number }
  | { status: "roll_finished" };

export interface StoredAdminPhoto extends StoredGalleryItem {
  updatedAt: Date;
  status: ModerationStatus;
  processingStatus: "pending" | "ready" | "failed";
  isPublic: boolean;
  invitationId: string;
}

export interface ModeratePhotoResult {
  status: ModerationStatus;
  isPublic: boolean;
  /** False when the photo already had that state (nothing written, nothing audited). */
  changed: boolean;
}

export type SetPublicResult =
  | { status: "ok"; moderationStatus: ModerationStatus; isPublic: boolean; changed: boolean }
  | { status: "not_eligible"; moderationStatus: ModerationStatus }
  | { status: "not_found" };

export class MediaRepository {
  /** Every upload of the invitation counts, whatever its state: a shot is spent once uploaded. */
  async countShots(invitationId: string): Promise<number> {
    const [row] = await db
      .select({ n: count() })
      .from(photos)
      .where(eq(photos.invitationId, invitationId));
    return row?.n ?? 0;
  }

  /**
   * Inserts the `pending` photo and its derivative job in one transaction, so a
   * photo never exists without the job that processes it. The invitation row is
   * locked while counting, so concurrent uploads can't overshoot the roll.
   */
  async createWithJob(photo: NewPhoto, maxShots: number): Promise<CreatePhotoResult> {
    return db.transaction(async (tx) => {
      await tx
        .select({ id: invitations.id })
        .from(invitations)
        .where(eq(invitations.id, photo.invitationId))
        .for("update");
      const [used] = await tx
        .select({ n: count() })
        .from(photos)
        .where(eq(photos.invitationId, photo.invitationId));
      const shotsUsed = used?.n ?? 0;
      if (shotsUsed >= maxShots) return { status: "roll_finished" } as const;

      await tx.insert(photos).values(photo);
      await tx.insert(jobs).values({ type: DERIVE_JOB, payload: { photoId: photo.id } });
      return { status: "ok", publicId: photo.publicId, shotsUsed: shotsUsed + 1 } as const;
    });
  }

  async findForDerivation(photoId: string): Promise<PhotoForDerivation | null> {
    const [row] = await db
      .select({
        id: photos.id,
        publicId: photos.publicId,
        originalKey: photos.originalKey,
        processingStatus: photos.processingStatus,
        moderationStatus: photos.moderationStatus,
      })
      .from(photos)
      .where(eq(photos.id, photoId));
    return row ?? null;
  }

  /** Derivatives exist: the photo becomes listable (it is already `visible`). */
  async markReady(photoId: string, width: number, height: number): Promise<void> {
    await db
      .update(photos)
      .set({ processingStatus: "ready", width, height, updatedAt: new Date() })
      .where(eq(photos.id, photoId));
  }

  /** Every attempt failed (e.g. a corrupt file): never listed, the original is kept. */
  async markFailed(photoId: string): Promise<void> {
    await db
      .update(photos)
      .set({ processingStatus: "failed", updatedAt: new Date() })
      .where(eq(photos.id, photoId));
  }

  /**
   * Visible, ready photos, newest first. Keyset pagination after the photo
   * whose publicId is `cursor` (compared in SQL, so no timestamp precision is
   * lost in the cursor). Reads one extra row to know whether there is a next page.
   */
  async listGallery(limit: number, cursor?: string, options: { publicOnly?: boolean } = {}): Promise<StoredGalleryItem[]> {
    const filters: SQL[] = [eq(photos.moderationStatus, "visible"), eq(photos.processingStatus, "ready")];
    // The curated public gallery (#75): additionally flagged by a moderator.
    if (options.publicOnly) filters.push(eq(photos.isPublic, true));
    if (cursor) filters.push(afterPhoto(cursor));
    return db
      .select({
        publicId: photos.publicId,
        width: photos.width,
        height: photos.height,
        createdAt: photos.createdAt,
      })
      .from(photos)
      .where(and(...filters))
      .orderBy(desc(photos.createdAt), desc(photos.publicId))
      .limit(limit + 1);
  }

  /** The admin moderation queue (#64): every photo, any state, newest first, filtered. */
  async listForAdmin(query: AdminMediaQuery): Promise<StoredAdminPhoto[]> {
    const filters: SQL[] = [];
    if (query.status) filters.push(eq(photos.moderationStatus, query.status));
    if (query.processing) filters.push(eq(photos.processingStatus, query.processing));
    if (query.isPublic !== undefined) filters.push(eq(photos.isPublic, query.isPublic));
    if (query.cursor) filters.push(afterPhoto(query.cursor));
    return db
      .select({
        publicId: photos.publicId,
        width: photos.width,
        height: photos.height,
        createdAt: photos.createdAt,
        updatedAt: photos.updatedAt,
        status: photos.moderationStatus,
        processingStatus: photos.processingStatus,
        isPublic: photos.isPublic,
        invitationId: photos.invitationId,
      })
      .from(photos)
      .where(and(...filters))
      .orderBy(desc(photos.createdAt), desc(photos.publicId))
      .limit(query.limit + 1);
  }

  /** Whether `publicId` has derivatives at all (`ready`), whatever its moderation state. Admin previews only. */
  async isProcessed(publicId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: photos.id })
      .from(photos)
      .where(and(eq(photos.publicId, publicId), eq(photos.processingStatus, "ready")));
    return Boolean(row);
  }

  /**
   * Flags or un-flags a photo for the curated public gallery (#75). Flagging
   * needs a visible, ready photo. Audited as `photo.public` when it changes.
   */
  async setPublic(publicId: string, isPublic: boolean, actor: string): Promise<SetPublicResult> {
    return db.transaction(async (tx) => {
      const [before] = await tx
        .select({
          id: photos.id,
          status: photos.moderationStatus,
          processing: photos.processingStatus,
          isPublic: photos.isPublic,
        })
        .from(photos)
        .where(eq(photos.publicId, publicId))
        .for("update");
      if (!before) return { status: "not_found" } as const;
      if (before.isPublic === isPublic) {
        return { status: "ok", moderationStatus: before.status, isPublic, changed: false } as const;
      }
      if (isPublic && (before.status !== "visible" || before.processing !== "ready")) {
        return { status: "not_eligible", moderationStatus: before.status } as const;
      }
      await tx.update(photos).set({ isPublic, updatedAt: new Date() }).where(eq(photos.id, before.id));
      await recordAudit(tx, {
        actor,
        action: "photo.public",
        targetType: "photo",
        targetId: before.id,
        metadata: { from: before.isPublic, to: isPublic },
      });
      return { status: "ok", moderationStatus: before.status, isPublic, changed: true } as const;
    });
  }

  /** A photo for the print queue (#72): its row id and whether it is visible and ready. */
  async findForPrint(publicId: string): Promise<{ id: string; printable: boolean } | null> {
    const [row] = await db
      .select({ id: photos.id, status: photos.moderationStatus, processing: photos.processingStatus })
      .from(photos)
      .where(eq(photos.publicId, publicId));
    if (!row) return null;
    return { id: row.id, printable: row.status === "visible" && row.processing === "ready" };
  }

  /** Whether the derivatives of `publicId` may be served: visible and ready, nothing else. */
  async isServable(publicId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: photos.id })
      .from(photos)
      .where(
        and(
          eq(photos.publicId, publicId),
          eq(photos.moderationStatus, "visible"),
          eq(photos.processingStatus, "ready"),
        ),
      );
    return Boolean(row);
  }

  /**
   * Sets the moderation state and audits it in the same transaction; null when
   * the photo is unknown. Setting the state it already has is a no-op, not
   * re-audited (like wishes).
   */
  async moderate(publicId: string, status: ModerationStatus, actor: string): Promise<ModeratePhotoResult | null> {
    return db.transaction(async (tx) => {
      const [before] = await tx
        .select({ id: photos.id, status: photos.moderationStatus, isPublic: photos.isPublic })
        .from(photos)
        .where(eq(photos.publicId, publicId))
        .for("update");
      if (!before) return null;
      if (before.status === status) return { status, isPublic: before.isPublic, changed: false };
      await tx
        .update(photos)
        .set({ moderationStatus: status, updatedAt: new Date() })
        .where(eq(photos.id, before.id));
      await recordAudit(tx, {
        actor,
        action: "photo.moderate",
        targetType: "photo",
        targetId: before.id,
        metadata: { from: before.status, to: status },
      });
      return { status, isPublic: before.isPublic, changed: true };
    });
  }
}

/** Keyset condition: photos after the one whose publicId is `cursor`, newest first. */
function afterPhoto(cursor: string): SQL {
  return sql`(${photos.createdAt}, ${photos.publicId}) < (SELECT p.created_at, p.public_id FROM photos p WHERE p.public_id = ${cursor})`;
}
