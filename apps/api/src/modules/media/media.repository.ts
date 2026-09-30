import type { ModerationStatus } from "@grad/contract";
import { and, count, desc, eq, sql } from "drizzle-orm";
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
  async listGallery(limit: number, cursor?: string): Promise<StoredGalleryItem[]> {
    const listable = and(eq(photos.moderationStatus, "visible"), eq(photos.processingStatus, "ready"));
    const after = cursor
      ? sql`(${photos.createdAt}, ${photos.publicId}) < (SELECT p.created_at, p.public_id FROM photos p WHERE p.public_id = ${cursor})`
      : undefined;
    return db
      .select({
        publicId: photos.publicId,
        width: photos.width,
        height: photos.height,
        createdAt: photos.createdAt,
      })
      .from(photos)
      .where(after ? and(listable, after) : listable)
      .orderBy(desc(photos.createdAt), desc(photos.publicId))
      .limit(limit + 1);
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

  /** Sets the moderation state and audits it in the same transaction; null when the photo is unknown. */
  async moderate(publicId: string, status: ModerationStatus, actor: string): Promise<ModerationStatus | null> {
    return db.transaction(async (tx) => {
      const [before] = await tx
        .select({ id: photos.id, status: photos.moderationStatus })
        .from(photos)
        .where(eq(photos.publicId, publicId))
        .for("update");
      if (!before) return null;
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
      return status;
    });
  }
}
