import type { GalleryItem, LiveDisplayMessage, Wish } from "@grad/contract";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { photos, wishes } from "../../db/schema.js";

/** One wish or photo whose state changed, as the message the display should apply. */
export interface DisplayChange {
  /** `wish:<id>` or `photo:<publicId>`. */
  key: string;
  /** Exact `updated_at` text: a new value means a new state to send. */
  version: string;
  updatedAt: Date;
  message: LiveDisplayMessage;
}

/** What the display feed reads. Only the database; nothing from the media pipeline's code. */
export interface DisplaySource {
  /** Database clock, so every cursor compares against the same clock as `updated_at`. */
  now(): Promise<Date>;
  /** Every wish and photo with `updated_at > since`, oldest change first. */
  changesSince(since: Date): Promise<DisplayChange[]>;
  /** Current state: the newest `limit` visible wishes and visible, processed photos, oldest first. */
  snapshot(limit: number): Promise<LiveDisplayMessage[]>;
}

const wishColumns = {
  id: wishes.id,
  authorName: wishes.authorName,
  body: wishes.body,
  createdAt: wishes.createdAt,
  moderationStatus: wishes.moderationStatus,
  updatedAt: wishes.updatedAt,
  version: sql<string>`${wishes.updatedAt}::text`,
};

const photoColumns = {
  publicId: photos.publicId,
  width: photos.width,
  height: photos.height,
  createdAt: photos.createdAt,
  moderationStatus: photos.moderationStatus,
  processingStatus: photos.processingStatus,
  updatedAt: photos.updatedAt,
  version: sql<string>`${photos.updatedAt}::text`,
};

type WishRow = { id: string; authorName: string; body: string; createdAt: Date };
type PhotoRow = { publicId: string; width: number | null; height: number | null; createdAt: Date };

function toWish(row: WishRow): Wish {
  return { id: row.id, authorName: row.authorName, body: row.body, createdAt: row.createdAt.toISOString() };
}

function toPhoto(row: PhotoRow): GalleryItem {
  return { publicId: row.publicId, width: row.width, height: row.height, createdAt: row.createdAt.toISOString() };
}

export class DisplayRepository implements DisplaySource {
  async now(): Promise<Date> {
    const { rows } = await db.execute<{ now: Date | string }>(sql`SELECT now() AS now`);
    return new Date(rows[0].now);
  }

  async changesSince(since: Date): Promise<DisplayChange[]> {
    const [wishRows, photoRows] = await Promise.all([
      db.select(wishColumns).from(wishes).where(gt(wishes.updatedAt, since)).orderBy(asc(wishes.updatedAt)),
      db.select(photoColumns).from(photos).where(gt(photos.updatedAt, since)).orderBy(asc(photos.updatedAt)),
    ]);

    const changes: DisplayChange[] = [
      ...wishRows.map((row) => ({
        key: `wish:${row.id}`,
        version: row.version,
        updatedAt: row.updatedAt,
        message:
          row.moderationStatus === "visible"
            ? ({ type: "wish", wish: toWish(row) } as const)
            : ({ type: "hidden", kind: "wish", id: row.id } as const),
      })),
      // A photo is shown once it is visible and its derivatives exist; any other
      // state takes it off screen (a no-op for a photo the display never had).
      ...photoRows.map((row) => ({
        key: `photo:${row.publicId}`,
        version: row.version,
        updatedAt: row.updatedAt,
        message:
          row.moderationStatus === "visible" && row.processingStatus === "ready"
            ? ({ type: "photo", photo: toPhoto(row) } as const)
            : ({ type: "hidden", kind: "photo", id: row.publicId } as const),
      })),
    ];
    return changes.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
  }

  async snapshot(limit: number): Promise<LiveDisplayMessage[]> {
    const [wishRows, photoRows] = await Promise.all([
      db
        .select(wishColumns)
        .from(wishes)
        .where(eq(wishes.moderationStatus, "visible"))
        .orderBy(desc(wishes.createdAt), desc(wishes.id))
        .limit(limit),
      db
        .select(photoColumns)
        .from(photos)
        .where(and(eq(photos.moderationStatus, "visible"), eq(photos.processingStatus, "ready")))
        .orderBy(desc(photos.createdAt), desc(photos.id))
        .limit(limit),
    ]);
    return [
      ...wishRows.reverse().map((row) => ({ type: "wish", wish: toWish(row) }) as const),
      ...photoRows.reverse().map((row) => ({ type: "photo", photo: toPhoto(row) }) as const),
    ];
  }
}
