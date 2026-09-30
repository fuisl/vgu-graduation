import {
  type GalleryResponse,
  MEDIA_MAX_UPLOAD_BYTES,
  MEDIA_SHOTS_PER_INVITATION,
  type MediaVariant,
  type ModerateMediaResponse,
  type ModerationStatus,
  type PageQuery,
  type UploadMediaResponse,
} from "@grad/contract";
import crypto from "node:crypto";
import type { Readable } from "node:stream";
import { type Config, config as defaultConfig } from "../../config.js";
import {
  buckets,
  ObjectNotFoundError,
  type ObjectStore,
  S3ObjectStore,
  type StoredObject,
} from "../../storage/object-store.js";
import { InvitationsService } from "../invitations/invitations.service.js";
import { MediaRepository } from "./media.repository.js";
import { derivativeKey } from "./media.variants.js";
import {
  ByteLimit,
  EmptyUploadError,
  peekHead,
  SNIFF_BYTES,
  sniffImageType,
  UploadTooLargeError,
} from "./upload-stream.js";

/**
 * Random, unguessable photo identifier used in every public URL and derivative
 * name (`{publicId}-{variant}.jpg`, decided 2026-09-27): 128 bits, base64url.
 */
export function generatePublicId(): string {
  return crypto.randomBytes(16).toString("base64url");
}

export type UploaderResult =
  | { status: "ok"; invitationId: string; shotsRemaining: number }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "roll_finished" };

export type UploadResult =
  | { status: "ok"; photo: UploadMediaResponse }
  | { status: "roll_finished" }
  | { status: "too_large" }
  | { status: "unsupported" }
  | { status: "empty" };

export type GalleryResult =
  | { status: "ok"; page: GalleryResponse }
  | { status: "invalid" }
  | { status: "expired" };

export class MediaService {
  constructor(
    private readonly invitations: Pick<InvitationsService, "resolveByToken"> = new InvitationsService(),
    private readonly repository: Pick<
      MediaRepository,
      "countShots" | "createWithJob" | "listGallery" | "isServable" | "moderate"
    > = new MediaRepository(),
    private readonly store: ObjectStore = new S3ObjectStore(defaultConfig),
    private readonly config: Config = defaultConfig,
  ) {}

  /**
   * Checks the credential and the roll before any bytes are read, so a guest
   * with no shots left doesn't upload 25 MB for nothing.
   */
  async authorizeUpload(token: string): Promise<UploaderResult> {
    const resolved = await this.invitations.resolveByToken(token);
    if (resolved.status !== "ok") return { status: resolved.status };
    const invitationId = resolved.invitation.id;
    const used = await this.repository.countShots(invitationId);
    if (used >= MEDIA_SHOTS_PER_INVITATION) return { status: "roll_finished" };
    return { status: "ok", invitationId, shotsRemaining: MEDIA_SHOTS_PER_INVITATION - used };
  }

  /**
   * Streams one file into `grad-originals` under the photo's row id, then records
   * the `pending` photo and its derivative job. A `limit` event on `file` (how the
   * multipart parser reports a truncated file) fails the upload like the byte
   * counter does. Throws StorageUnavailableError when Garage is down.
   */
  async upload(invitationId: string, file: Readable): Promise<UploadResult> {
    const head = await peekHead(file, SNIFF_BYTES);
    if (head.length === 0) return { status: "empty" };
    const contentType = head.length >= SNIFF_BYTES ? sniffImageType(head) : null;
    if (!contentType) return { status: "unsupported" };

    const { originals } = buckets(this.config);
    const id = crypto.randomUUID();
    const originalKey = id;
    const counter = new ByteLimit(MEDIA_MAX_UPLOAD_BYTES);
    file.once("limit", () => counter.destroy(new UploadTooLargeError()));
    file.on("error", (err) => counter.destroy(err));
    file.pipe(counter);

    try {
      await this.store.putStream(originals, originalKey, counter, contentType);
    } catch (err) {
      if (err instanceof UploadTooLargeError) return { status: "too_large" };
      if (err instanceof EmptyUploadError) return { status: "empty" };
      throw err;
    }
    if ((file as { truncated?: boolean }).truncated) {
      await this.store.delete(originals, originalKey).catch(() => {});
      return { status: "too_large" };
    }

    const created = await this.repository
      .createWithJob(
        {
          id,
          publicId: generatePublicId(),
          invitationId,
          originalKey,
          contentType,
          sizeBytes: counter.bytes,
        },
        MEDIA_SHOTS_PER_INVITATION,
      )
      .catch(async (err: unknown) => {
        await this.store.delete(originals, originalKey).catch(() => {});
        throw err;
      });
    if (created.status === "roll_finished") {
      // A concurrent upload took the last shot while this one streamed.
      await this.store.delete(originals, originalKey).catch(() => {});
      return { status: "roll_finished" };
    }
    return {
      status: "ok",
      photo: {
        publicId: created.publicId,
        processingStatus: "pending",
        shotsRemaining: MEDIA_SHOTS_PER_INVITATION - created.shotsUsed,
      },
    };
  }

  /** GET /gallery for an invited guest: visible, processed photos only, newest first. */
  async listGallery(token: string, query: PageQuery): Promise<GalleryResult> {
    const resolved = await this.invitations.resolveByToken(token);
    if (resolved.status !== "ok") return { status: resolved.status };

    const rows = await this.repository.listGallery(query.limit, query.cursor);
    const items = rows.slice(0, query.limit).map((r) => ({
      publicId: r.publicId,
      width: r.width,
      height: r.height,
      createdAt: r.createdAt.toISOString(),
    }));
    const nextCursor = rows.length > query.limit ? items[items.length - 1]!.publicId : null;
    return { status: "ok", page: { items, nextCursor } };
  }

  /**
   * Opens one derivative for streaming, or null when the photo is unknown, not
   * yet processed, hidden or removed. Originals are never reachable from here.
   * Throws StorageUnavailableError when Garage is down.
   */
  async openDerivative(publicId: string, variant: MediaVariant): Promise<StoredObject | null> {
    if (!(await this.repository.isServable(publicId))) return null;
    try {
      return await this.store.get(buckets(this.config).derivatives, derivativeKey(publicId, variant));
    } catch (err) {
      if (err instanceof ObjectNotFoundError) return null;
      throw err;
    }
  }

  /** POST /admin/media/{id}/moderate; null when no photo has that publicId. */
  async moderate(publicId: string, status: ModerationStatus, actor: string): Promise<ModerateMediaResponse | null> {
    const updated = await this.repository.moderate(publicId, status, actor);
    return updated ? { publicId, status: updated } : null;
  }
}
