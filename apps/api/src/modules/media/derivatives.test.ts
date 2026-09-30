import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import { fakeObjectStore } from "../../storage/object-store.fake.js";
import type { Job } from "../../worker/queue.js";
import { deriveHandler, renderDerivatives } from "./derivatives.js";
import type { PhotoForDerivation } from "./media.repository.js";
import { derivativeKey } from "./media.variants.js";

const config = loadConfig({ S3_BUCKET_ORIGINALS: "grad-originals", S3_BUCKET_DERIVATIVES: "grad-derivatives" });
const PHOTO_ID = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";
const PUBLIC_ID = "EMV5xWTOra4aOngA9GnNdQ";

/** A 3000x2000 phone-style JPEG stored sideways (orientation 6) with GPS, camera and owner EXIF. */
let phoneJpeg: Buffer;
let transparentPng: Buffer;

beforeAll(async () => {
  phoneJpeg = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#884422" } })
    .jpeg()
    .withExif({
      IFD0: { Make: "SecretCam", Model: "Guest Phone", Artist: "Jane Guest", Copyright: "Jane Guest" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "10/1 45/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "106/1 40/1 0/1" },
    })
    .withMetadata({ orientation: 6 })
    .toBuffer();
  transparentPng = await sharp({ create: { width: 300, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .png()
    .toBuffer();
});

describe("renderDerivatives", () => {
  it("fixture really carries EXIF, GPS and a rotation", async () => {
    const meta = await sharp(phoneJpeg).metadata();
    expect(meta.exif?.length).toBeGreaterThan(0);
    expect(meta.orientation).toBe(6);
    expect(meta.exif!.includes(Buffer.from("SecretCam"))).toBe(true);
  });

  it("strips all metadata, applies orientation and bounds each variant", async () => {
    const out = await renderDerivatives(phoneJpeg);
    // Orientation 6 turns the stored 3000x2000 into a 2000x3000 portrait.
    expect(out).toMatchObject({ width: 2000, height: 3000 });

    for (const [variant, maxEdge] of [["thumb", 640], ["display", 2048]] as const) {
      const buf = out.variants[variant];
      const meta = await sharp(buf).metadata();
      expect(meta.format).toBe("jpeg");
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.iptc).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
      expect(buf.includes(Buffer.from("SecretCam"))).toBe(false);
      expect(buf.includes(Buffer.from("Jane Guest"))).toBe(false);
      expect(meta.height).toBe(maxEdge);
      expect(meta.width).toBe(Math.round((maxEdge * 2) / 3));
    }
  });

  it("never upscales small images and flattens transparency onto white", async () => {
    const out = await renderDerivatives(transparentPng);
    const meta = await sharp(out.variants.display).metadata();
    expect([meta.width, meta.height]).toEqual([300, 200]);
    const { data } = await sharp(out.variants.thumb).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(245);
  });

  it("rejects bytes that only look like an image", async () => {
    await expect(renderDerivatives(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]))).rejects.toThrow();
  });
});

function setup(photo: Partial<PhotoForDerivation> | null = {}) {
  const storage = fakeObjectStore();
  const calls: string[] = [];
  const row: PhotoForDerivation | null = photo && {
    id: PHOTO_ID,
    publicId: PUBLIC_ID,
    originalKey: PHOTO_ID,
    processingStatus: "pending",
    moderationStatus: "visible",
    ...photo,
  };
  const handler = deriveHandler({
    config,
    store: storage.store,
    repository: {
      findForDerivation: async () => row,
      markReady: async (id, w, h) => void calls.push(`ready:${id}:${w}x${h}`),
      markFailed: async (id) => void calls.push(`failed:${id}`),
    },
  });
  const job = (attempts = 1): Job => ({ id: "j1", type: "media.derive", payload: { photoId: PHOTO_ID }, attempts, maxAttempts: 5 });
  return { storage, calls, handler, job };
}

describe("media.derive handler", () => {
  it("writes {publicId}-{variant}.jpg to grad-derivatives and marks the photo ready", async () => {
    const { storage, calls, handler, job } = setup();
    await storage.store.put("grad-originals", PHOTO_ID, phoneJpeg, "image/jpeg");
    await handler(job());

    expect([...storage.objects.keys()].sort()).toEqual([
      `grad-derivatives/${PUBLIC_ID}-display.jpg`,
      `grad-derivatives/${PUBLIC_ID}-thumb.jpg`,
      `grad-originals/${PHOTO_ID}`,
    ]);
    expect(derivativeKey(PUBLIC_ID, "thumb")).toBe(`${PUBLIC_ID}-thumb.jpg`);
    expect(storage.objects.get(`grad-derivatives/${PUBLIC_ID}-thumb.jpg`)!.contentType).toBe("image/jpeg");
    // The original is preserved untouched.
    expect(storage.objects.get(`grad-originals/${PHOTO_ID}`)!.body.equals(phoneJpeg)).toBe(true);
    expect(calls).toEqual([`ready:${PHOTO_ID}:2000x3000`]);
  });

  it("is a no-op for a missing, already ready or removed photo", async () => {
    for (const photo of [null, { processingStatus: "ready" as const }, { moderationStatus: "removed" as const }]) {
      const { storage, calls, handler, job } = setup(photo);
      await handler(job());
      expect(calls).toEqual([]);
      expect(storage.objects.size).toBe(0);
    }
  });

  it("still processes hidden photos, since hiding is reversible", async () => {
    const { storage, calls, handler, job } = setup({ moderationStatus: "hidden" });
    await storage.store.put("grad-originals", PHOTO_ID, transparentPng, "image/png");
    await handler(job());
    expect(calls).toEqual([`ready:${PHOTO_ID}:300x200`]);
  });

  it("throws to retry, and marks the photo failed only on the last attempt", async () => {
    const { storage, calls, handler, job } = setup();
    await storage.store.put("grad-originals", PHOTO_ID, Buffer.from([0xff, 0xd8, 0xff, 0, 1, 2]), "image/jpeg");
    await expect(handler(job(1))).rejects.toThrow();
    expect(calls).toEqual([]);
    await expect(handler(job(5))).rejects.toThrow();
    expect(calls).toEqual([`failed:${PHOTO_ID}`]);
  });

  it("retries when storage is down", async () => {
    const { storage, calls, handler, job } = setup();
    storage.state.down = true;
    await expect(handler(job())).rejects.toThrow("object storage unavailable");
    expect(calls).toEqual([]);
  });
});
