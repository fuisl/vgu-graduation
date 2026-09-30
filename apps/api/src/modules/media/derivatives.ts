import type { MediaVariant } from "@grad/contract";
import sharp from "sharp";
import { type Config, config as defaultConfig } from "../../config.js";
import { buckets, type ObjectStore, S3ObjectStore } from "../../storage/object-store.js";
import type { Job } from "../../worker/queue.js";
import type { JobHandler } from "../../worker/worker.js";
import { MediaRepository } from "./media.repository.js";
import { derivativeKey, VARIANTS } from "./media.variants.js";

// A long-running worker handles one photo at a time: don't let libvips keep
// decoded images around between jobs.
sharp.cache(false);

/** Refuse decompression bombs: far above any phone camera (a 200 MP sensor is 2e8). */
const MAX_INPUT_PIXELS = 250_000_000;

export interface RenderedDerivatives {
  /** Dimensions of the original once EXIF orientation is applied. */
  width: number;
  height: number;
  variants: Record<MediaVariant, Buffer>;
}

/**
 * Auto-orients the original, then writes each variant as an sRGB JPEG. sharp
 * drops EXIF (GPS, camera, owner), XMP, IPTC and ICC blocks unless asked to
 * keep them, and nothing here asks. Transparent PNG/WebP areas become white.
 */
export async function renderDerivatives(original: Buffer): Promise<RenderedDerivatives> {
  const oriented = sharp(original, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).rotate();
  const meta = await oriented.metadata();
  if (!meta.width || !meta.height) throw new Error("image has no dimensions");
  // metadata() reports the stored size; orientations 5-8 swap the axes.
  const swap = (meta.orientation ?? 1) >= 5;

  const variants = {} as Record<MediaVariant, Buffer>;
  for (const [variant, { maxEdge, quality }] of Object.entries(VARIANTS) as [MediaVariant, (typeof VARIANTS)[MediaVariant]][]) {
    variants[variant] = await oriented
      .clone()
      .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .toColorspace("srgb")
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  }
  return {
    width: swap ? meta.height : meta.width,
    height: swap ? meta.width : meta.height,
    variants,
  };
}

export interface DeriveDeps {
  repository?: Pick<MediaRepository, "findForDerivation" | "markReady" | "markFailed">;
  store?: ObjectStore;
  config?: Config;
}

async function readAll(body: AsyncIterable<unknown>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/**
 * Worker handler for `media.derive` (payload `{ photoId }`): reads the original
 * from grad-originals, writes `{publicId}-{variant}.jpg` to grad-derivatives and
 * marks the photo `ready`. It stays `visible`: photos are shown without
 * pre-review (decided 2026-09-27). Idempotent, so a re-claimed job just
 * overwrites the same names. On the last failed attempt the photo is marked
 * `failed` so it never lingers as `pending`.
 */
export function deriveHandler(deps: DeriveDeps = {}): JobHandler {
  const config = deps.config ?? defaultConfig;
  const repository = deps.repository ?? new MediaRepository();
  const store = deps.store ?? new S3ObjectStore(config);

  return async (job: Job) => {
    const photoId = job.payload.photoId;
    if (typeof photoId !== "string") throw new Error("media.derive payload has no photoId");

    const photo = await repository.findForDerivation(photoId);
    // Deleted, already done by an earlier run, or taken down before processing.
    if (!photo || photo.processingStatus === "ready" || photo.moderationStatus === "removed") return;

    try {
      const { originals, derivatives } = buckets(config);
      const original = await readAll((await store.get(originals, photo.originalKey)).body);
      const rendered = await renderDerivatives(original);
      for (const [variant, body] of Object.entries(rendered.variants) as [MediaVariant, Buffer][]) {
        await store.put(derivatives, derivativeKey(photo.publicId, variant), body, "image/jpeg");
      }
      await repository.markReady(photo.id, rendered.width, rendered.height);
    } catch (err) {
      if (job.attempts >= job.maxAttempts) await repository.markFailed(photo.id);
      throw err;
    }
  };
}
