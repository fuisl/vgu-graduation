import { count, eq } from "drizzle-orm";
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
}
