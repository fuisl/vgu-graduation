import crypto from "node:crypto";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { ObjectNotFoundError, S3ObjectStore, StorageUnavailableError } from "./object-store.js";

const devS3 = {
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://localhost:3900",
  S3_REGION: process.env.S3_REGION ?? "garage",
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? "GK000000000000000000000001",
  S3_SECRET_ACCESS_KEY:
    process.env.S3_SECRET_ACCESS_KEY ?? "0000000000000000000000000000000000000000000000000000000000000002",
  S3_BUCKET_ORIGINALS: "grad-originals",
  S3_BUCKET_DERIVATIVES: "grad-derivatives",
};

async function garageReachable(): Promise<boolean> {
  try {
    await fetch(devS3.S3_ENDPOINT, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}

describe("S3ObjectStore", () => {
  it("fails fast with StorageUnavailableError when storage is unreachable", async () => {
    // Nothing listens on port 9; no Garage needed for this test.
    const store = new S3ObjectStore(loadConfig({ ...devS3, S3_ENDPOINT: "http://127.0.0.1:9" }));
    const started = Date.now();
    await expect(
      store.putStream("grad-originals", "x", Readable.from([Buffer.from("hello")]), "image/jpeg"),
    ).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(store.get("grad-originals", "x")).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  it("fails with StorageUnavailableError when S3 isn't configured", async () => {
    const store = new S3ObjectStore(loadConfig({}));
    await expect(store.delete("grad-originals", "x")).rejects.toBeInstanceOf(StorageUnavailableError);
  });

  it("streams, reads and deletes against the local Garage (skipped without `pnpm services:up`)", async (ctx) => {
    if (!(await garageReachable())) return ctx.skip();
    const store = new S3ObjectStore(loadConfig(devS3));
    const key = `test-${crypto.randomUUID()}`;
    // Larger than one 5 MB part, so this exercises a real multipart upload.
    const body = crypto.randomBytes(6 * 1024 * 1024);
    const chunks = Array.from({ length: 96 }, (_, i) => body.subarray(i * 65536, (i + 1) * 65536));
    await store.putStream("grad-originals", key, Readable.from(chunks), "image/jpeg");

    const got = await store.get("grad-originals", key);
    expect(got.contentType).toBe("image/jpeg");
    const read: Buffer[] = [];
    for await (const chunk of got.body) read.push(chunk as Buffer);
    expect(Buffer.concat(read).equals(body)).toBe(true);

    await store.delete("grad-originals", key);
    await store.delete("grad-originals", key);
    await expect(store.get("grad-originals", key)).rejects.toBeInstanceOf(ObjectNotFoundError);
  }, 30_000);

  it("surfaces the body's own error instead of blaming storage", async (ctx) => {
    if (!(await garageReachable())) return ctx.skip();
    const store = new S3ObjectStore(loadConfig(devS3));
    const failing = new Readable({
      read() {
        this.destroy(new RangeError("too big"));
      },
    });
    await expect(store.putStream("grad-originals", `test-${crypto.randomUUID()}`, failing, "image/jpeg")).rejects.toBeInstanceOf(
      RangeError,
    );
  });
});
