import {
  MEDIA_MAX_UPLOAD_BYTES,
  MEDIA_SHOTS_PER_INVITATION,
  type UploadMediaResponse,
} from "@grad/contract";
import crypto from "node:crypto";
import type { Readable } from "node:stream";
import { type Config, config as defaultConfig } from "../../config.js";
import { buckets, type ObjectStore, S3ObjectStore } from "../../storage/object-store.js";
import { InvitationsService } from "../invitations/invitations.service.js";
import { MediaRepository } from "./media.repository.js";
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

export class MediaService {
  constructor(
    private readonly invitations: Pick<InvitationsService, "resolveByToken"> = new InvitationsService(),
    private readonly repository: Pick<MediaRepository, "countShots" | "createWithJob"> = new MediaRepository(),
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
}
