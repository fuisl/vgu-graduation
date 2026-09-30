import { MEDIA_MAX_UPLOAD_BYTES, MEDIA_SHOTS_PER_INVITATION, uploadMediaResponseSchema } from "@grad/contract";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import { buildServer } from "../../server.js";
import { fakeObjectStore } from "../../storage/object-store.fake.js";
import { approvedTester } from "../admin/admin-accounts.fake.js";
import type { ResolveResult } from "../invitations/invitations.service.js";
import type { NewPhoto } from "./media.repository.js";
import { MediaService } from "./media.service.js";

const config = loadConfig({
  LOG_LEVEL: "info",
  S3_BUCKET_ORIGINALS: "grad-originals",
  S3_BUCKET_DERIVATIVES: "grad-derivatives",
});
const TOKEN = "guest-bearer-token-value";
const INVITATION_ID = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";
const auth = { authorization: `Bearer ${TOKEN}` };

const invitation = {
  id: INVITATION_ID,
  guest: { id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70", name: "Jane Guest", email: "jane@example.com", phone: null },
  maxPlusOnes: 0,
  status: "active" as const,
  validFrom: null,
  validUntil: null,
  inviters: [],
  rsvp: null,
};

/** Smallest byte prefixes the sniffer recognises, padded to a plausible file. */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2048, 7)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(512, 1)]);

function multipart(file: Buffer, { filename = "IMG_0001.jpg", type = "image/jpeg" } = {}) {
  const boundary = "----grad26test";
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
    ),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { ...auth, "content-type": `multipart/form-data; boundary=${boundary}` } };
}

function setup({
  resolve = (t: string): ResolveResult => (t === TOKEN ? { status: "ok", invitation } : { status: "invalid" }),
  shotsUsed = 0,
}: { resolve?: (token: string) => ResolveResult; shotsUsed?: number } = {}) {
  const photos: NewPhoto[] = [];
  const jobs: string[] = [];
  const storage = fakeObjectStore();
  const lines: string[] = [];
  let used = shotsUsed;
  const service = new MediaService(
    { resolveByToken: async (token) => resolve(token) },
    {
      countShots: async () => used,
      createWithJob: async (photo, max) => {
        if (used >= max) return { status: "roll_finished" };
        used += 1;
        photos.push(photo);
        jobs.push(photo.id);
        return { status: "ok", publicId: photo.publicId, shotsUsed: used };
      },
    },
    storage.store,
    config,
  );
  const app = buildServer({
    adminAccounts: approvedTester(),
    config,
    mediaService: service,
    logStream: { write: (line: string) => void lines.push(line) },
  });
  return { app, photos, jobs, storage, lines };
}

describe("POST /media", () => {
  it("streams the original to grad-originals, records a pending photo and job, and returns 201", async () => {
    const { app, photos, jobs, storage } = setup();
    // The declared type is ignored: the bytes say PNG.
    const res = await app.inject({ method: "POST", url: "/media", ...multipart(PNG, { type: "image/jpeg" }) });
    expect(res.statusCode).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");
    const body = uploadMediaResponseSchema.parse(res.json());
    expect(body).toMatchObject({ processingStatus: "pending", shotsRemaining: MEDIA_SHOTS_PER_INVITATION - 1 });
    expect(body.publicId).toMatch(/^[A-Za-z0-9_-]{22}$/);

    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({ invitationId: INVITATION_ID, contentType: "image/png", sizeBytes: PNG.length });
    // Originals are keyed by the row id, never by the public id.
    expect(photos[0]!.originalKey).toBe(photos[0]!.id);
    expect(photos[0]!.originalKey).not.toContain(body.publicId);
    expect(storage.objects.get(`grad-originals/${photos[0]!.originalKey}`)?.body.equals(PNG)).toBe(true);
    expect(jobs).toEqual([photos[0]!.id]);
  });

  it("accepts the inv cookie", async () => {
    const { app } = setup();
    const { payload, headers } = multipart(JPEG);
    const res = await app.inject({
      method: "POST",
      url: "/media",
      payload,
      headers: { "content-type": headers["content-type"], cookie: `inv=${TOKEN}` },
    });
    expect(res.statusCode).toBe(201);
  });

  it("returns 401 without a credential, 404 for an invalid one and 410 when expired", async () => {
    const { payload, headers } = multipart(JPEG);
    const noAuth = { "content-type": headers["content-type"] };
    expect((await setup().app.inject({ method: "POST", url: "/media", payload, headers: noAuth })).statusCode).toBe(401);
    const wrong = await setup().app.inject({
      method: "POST",
      url: "/media",
      payload,
      headers: { ...noAuth, authorization: "Bearer wrong" },
    });
    expect(wrong.statusCode).toBe(404);
    const expired = setup({ resolve: () => ({ status: "expired" }) });
    expect((await expired.app.inject({ method: "POST", url: "/media", payload, headers })).statusCode).toBe(410);
  });

  it("rejects bytes that are not a supported image with 415, whatever the declared type", async () => {
    const { app, photos, storage } = setup();
    const res = await app.inject({
      method: "POST",
      url: "/media",
      ...multipart(Buffer.from("<html><script>alert(1)</script></html>"), { type: "image/jpeg" }),
    });
    expect(res.statusCode).toBe(415);
    expect(res.json()).toEqual({
      error: "Unsupported Media Type",
      message: "Only JPEG, PNG and WebP photos can be uploaded",
    });
    expect(photos).toHaveLength(0);
    expect(storage.objects.size).toBe(0);
  });

  it("rejects an empty file with 400", async () => {
    const { app, photos } = setup();
    const res = await app.inject({ method: "POST", url: "/media", ...multipart(Buffer.alloc(0)) });
    expect(res.statusCode).toBe(400);
    expect(photos).toHaveLength(0);
  });

  it("rejects a request without a file part", async () => {
    const { app } = setup();
    const boundary = "----grad26test";
    const res = await app.inject({
      method: "POST",
      url: "/media",
      payload: `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\nhi\r\n--${boundary}--\r\n`,
      headers: { ...auth, "content-type": `multipart/form-data; boundary=${boundary}` },
    });
    expect(res.statusCode).toBe(400);
    const json = await app.inject({ method: "POST", url: "/media", payload: { a: 1 }, headers: auth });
    expect(json.statusCode).toBe(400);
  });

  it("enforces the 25 MB cap while streaming and stores nothing", async () => {
    const { app, photos, storage } = setup();
    const big = Buffer.concat([JPEG, Buffer.alloc(MEDIA_MAX_UPLOAD_BYTES)]);
    const res = await app.inject({ method: "POST", url: "/media", ...multipart(big) });
    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ error: "Payload Too Large" });
    expect(photos).toHaveLength(0);
    expect(storage.objects.size).toBe(0);
  });

  it("accepts a file of exactly 25 MB", async () => {
    const { app } = setup();
    const exact = Buffer.concat([JPEG, Buffer.alloc(MEDIA_MAX_UPLOAD_BYTES - JPEG.length)]);
    const res = await app.inject({ method: "POST", url: "/media", ...multipart(exact) });
    expect(res.statusCode).toBe(201);
  });

  it("returns 409 once the roll of 36 is used, before reading the file", async () => {
    const { app, storage } = setup({ shotsUsed: MEDIA_SHOTS_PER_INVITATION });
    const res = await app.inject({ method: "POST", url: "/media", ...multipart(JPEG) });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: "Conflict" });
    expect(storage.objects.size).toBe(0);
  });

  it("counts the last shot down to zero", async () => {
    const { app } = setup({ shotsUsed: MEDIA_SHOTS_PER_INVITATION - 1 });
    const res = await app.inject({ method: "POST", url: "/media", ...multipart(JPEG) });
    expect(res.statusCode).toBe(201);
    expect(res.json().shotsRemaining).toBe(0);
  });

  it("answers a clear, retryable 503 when Garage is down", async () => {
    const { app, photos, storage } = setup();
    storage.state.down = true;
    const res = await app.inject({ method: "POST", url: "/media", ...multipart(JPEG) });
    expect(res.statusCode).toBe(503);
    expect(res.headers["retry-after"]).toBe("30");
    expect(res.json()).toEqual({
      error: "Service Unavailable",
      message: "Photo uploads are temporarily unavailable. Please try again in a moment.",
    });
    expect(photos).toHaveLength(0);
  });

  it("never logs the token, the guest's name or the file name", async () => {
    const { app, lines } = setup();
    await app.inject({ method: "POST", url: "/media", ...multipart(JPEG, { filename: "jane-guest-private.jpg" }) });
    const cookie = multipart(JPEG);
    await app.inject({
      method: "POST",
      url: "/media",
      payload: cookie.payload,
      headers: { "content-type": cookie.headers["content-type"], cookie: `inv=${TOKEN}` },
    });
    const output = lines.join("\n");
    expect(output).toContain("photo uploaded");
    expect(output).not.toContain(TOKEN);
    expect(output).not.toContain("Jane Guest");
    expect(output).not.toContain("jane-guest-private");
  });
});
