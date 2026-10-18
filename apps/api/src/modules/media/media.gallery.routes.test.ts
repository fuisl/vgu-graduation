import {
  adminMediaResponseSchema,
  galleryResponseSchema,
  type ModerationStatus,
  publicGalleryResponseSchema,
  setMediaPublicResponseSchema,
} from "@grad/contract";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import { buildServer } from "../../server.js";
import { fakeObjectStore } from "../../storage/object-store.fake.js";
import { approvedTester, fakeAdminAccounts } from "../admin/admin-accounts.fake.js";
import type { ResolveResult } from "../invitations/invitations.service.js";
import { MediaService } from "./media.service.js";

const config = loadConfig({
  LOG_LEVEL: "silent",
  S3_BUCKET_ORIGINALS: "grad-originals",
  S3_BUCKET_DERIVATIVES: "grad-derivatives",
});
const TOKEN = "guest-bearer-token-value";
const auth = { authorization: `Bearer ${TOKEN}` };
const invitation = {
  id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
  guest: { id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70", name: "Jane", email: null, phone: null },
  maxPlusOnes: 0,
  status: "active" as const,
  validFrom: null,
  validUntil: null,
  inviters: [],
  rsvp: null,
};

interface FakePhoto {
  id: string;
  publicId: string;
  processing: "pending" | "ready" | "failed";
  moderation: ModerationStatus;
  isPublic: boolean;
  createdAt: Date;
}

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

/** Real MediaService over an in-memory photo table (same filters as the repository) and object store. */
function setup(resolve: (t: string) => ResolveResult = (t) => (t === TOKEN ? { status: "ok", invitation } : { status: "invalid" })) {
  const photos: FakePhoto[] = [];
  const audits: [string, string, ModerationStatus | boolean][] = [];
  const storage = fakeObjectStore();
  const newestFirst = (a: FakePhoto, b: FakePhoto) =>
    b.createdAt.getTime() - a.createdAt.getTime() || (a.publicId < b.publicId ? 1 : -1);
  const listable = () => photos.filter((p) => p.moderation === "visible" && p.processing === "ready").sort(newestFirst);
  const page = <T extends FakePhoto>(all: T[], limit: number, cursor?: string) => {
    const start = cursor ? all.findIndex((p) => p.publicId === cursor) + 1 : 0;
    return all.slice(start, start + limit + 1);
  };
  const service = new MediaService(
    { resolveByToken: async (t) => resolve(t) },
    {
      countShots: async () => 0,
      createWithJob: async () => ({ status: "roll_finished" }),
      listGallery: async (limit, cursor, options) =>
        page(listable().filter((p) => !options?.publicOnly || p.isPublic), limit, cursor).map((p) => ({
          publicId: p.publicId,
          width: 4,
          height: 3,
          createdAt: p.createdAt,
        })),
      listForAdmin: async (query) =>
        page(
          [...photos]
            .filter((p) => !query.status || p.moderation === query.status)
            .filter((p) => !query.processing || p.processing === query.processing)
            .filter((p) => query.isPublic === undefined || p.isPublic === query.isPublic)
            .sort(newestFirst),
          query.limit,
          query.cursor,
        ).map((p) => ({
          publicId: p.publicId,
          width: 4,
          height: 3,
          createdAt: p.createdAt,
          updatedAt: p.createdAt,
          status: p.moderation,
          processingStatus: p.processing,
          isPublic: p.isPublic,
          invitationId: invitation.id,
        })),
      isServable: async (publicId) => listable().some((p) => p.publicId === publicId),
      isProcessed: async (publicId) => photos.some((p) => p.publicId === publicId && p.processing === "ready"),
      moderate: async (publicId, status, actor) => {
        const photo = photos.find((p) => p.publicId === publicId);
        if (!photo) return null;
        const changed = photo.moderation !== status;
        photo.moderation = status;
        if (changed) audits.push([actor, publicId, status]);
        return { status, isPublic: photo.isPublic, changed };
      },
      setPublic: async (publicId, isPublic, actor) => {
        const photo = photos.find((p) => p.publicId === publicId);
        if (!photo) return { status: "not_found" };
        if (photo.isPublic === isPublic) return { status: "ok", moderationStatus: photo.moderation, isPublic, changed: false };
        if (isPublic && (photo.moderation !== "visible" || photo.processing !== "ready")) {
          return { status: "not_eligible", moderationStatus: photo.moderation };
        }
        photo.isPublic = isPublic;
        audits.push([actor, publicId, isPublic]);
        return { status: "ok", moderationStatus: photo.moderation, isPublic, changed: true };
      },
    },
    storage.store,
    config,
  );
  const add = (n: number, overrides: Partial<FakePhoto> = {}) => {
    const photo: FakePhoto = {
      id: `row-${n}`,
      publicId: `pub${String(n).padStart(19, "0")}`,
      processing: "ready",
      moderation: "visible",
      isPublic: false,
      createdAt: new Date(Date.UTC(2026, 10, 15, 3, 0, n)),
      ...overrides,
    };
    photos.push(photo);
    for (const variant of ["thumb", "display"]) {
      storage.objects.set(`grad-derivatives/${photo.publicId}-${variant}.jpg`, { body: JPEG_BYTES, contentType: "image/jpeg" });
    }
    storage.objects.set(`grad-originals/${photo.id}`, { body: Buffer.from("ORIGINAL"), contentType: "image/jpeg" });
    return photo;
  };
  return { service, photos, audits, storage, add };
}

function server(service: MediaService, adminAccounts = approvedTester()) {
  return buildServer({ adminAccounts, config, mediaService: service });
}

async function adminToken(handle = "tester") {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(handle)
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(config.adminSessionSecret));
}

describe("GET /gallery", () => {
  it("is public: no credential needed, and an invalid one is ignored", async () => {
    const { service, add } = setup();
    add(1);
    const app = server(service);
    const anonymous = await app.inject({ method: "GET", url: "/gallery" });
    expect(anonymous.statusCode).toBe(200);
    expect(anonymous.json().items).toHaveLength(1);
    expect((await app.inject({ method: "GET", url: "/gallery", headers: { authorization: "Bearer nope" } })).statusCode).toBe(200);
  });

  it("lists only visible, ready photos, newest first, with the contract shape", async () => {
    const { service, add } = setup();
    add(1);
    add(2, { processing: "pending" });
    add(3, { moderation: "hidden" });
    add(4, { moderation: "removed" });
    add(5, { processing: "failed" });
    add(6);
    const res = await server(service).inject({ method: "GET", url: "/gallery", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, s-maxage=60");
    const body = galleryResponseSchema.parse(res.json());
    expect(body.items.map((i) => i.publicId)).toEqual(["pub0000000000000000006", "pub0000000000000000001"]);
    expect(body.nextCursor).toBeNull();
    expect(JSON.stringify(body)).not.toContain("row-");
  });

  it("pages with an opaque cursor", async () => {
    const { service, add } = setup();
    for (let n = 1; n <= 5; n++) add(n);
    const app = server(service);
    const first = (await app.inject({ method: "GET", url: "/gallery?limit=2", headers: auth })).json();
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBe("pub0000000000000000004");
    const second = (await app.inject({ method: "GET", url: `/gallery?limit=2&cursor=${first.nextCursor}`, headers: auth })).json();
    const third = (await app.inject({ method: "GET", url: `/gallery?limit=2&cursor=${second.nextCursor}`, headers: auth })).json();
    expect([...first.items, ...second.items, ...third.items].map((i: { publicId: string }) => i.publicId.slice(-1))).toEqual(["5", "4", "3", "2", "1"]);
    expect(third.nextCursor).toBeNull();
    expect((await app.inject({ method: "GET", url: "/gallery?limit=500", headers: auth })).statusCode).toBe(400);
  });
});

describe("GET /media/:id/:variant", () => {
  it("serves a derivative without a credential, as an immutable JPEG", async () => {
    const { service, add } = setup();
    const photo = add(1);
    const res = await server(service).inject({ method: "GET", url: `/media/${photo.publicId}/thumb` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-length"]).toBe(String(JPEG_BYTES.length));
    expect(res.rawPayload.equals(JPEG_BYTES)).toBe(true);
  });

  it("never serves originals, unknown variants, or photos that aren't visible and ready", async () => {
    const { service, add } = setup();
    const ready = add(1);
    const pending = add(2, { processing: "pending" });
    const hidden = add(3, { moderation: "hidden" });
    const removed = add(4, { moderation: "removed" });
    const app = server(service);
    expect((await app.inject({ method: "GET", url: `/media/${ready.publicId}/original` })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: `/media/${ready.id}/display` })).statusCode).toBe(404);
    for (const photo of [pending, hidden, removed]) {
      const res = await app.inject({ method: "GET", url: `/media/${photo.publicId}/display` });
      expect(res.statusCode).toBe(404);
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.json()).toEqual({ error: "Not Found", message: "Photo not found" });
    }
  });

  it("answers 404 when the derivative object is missing and 503 when Garage is down", async () => {
    const { service, add, storage } = setup();
    const photo = add(1);
    storage.objects.delete(`grad-derivatives/${photo.publicId}-thumb.jpg`);
    const app = server(service);
    expect((await app.inject({ method: "GET", url: `/media/${photo.publicId}/thumb` })).statusCode).toBe(404);
    storage.state.down = true;
    const res = await app.inject({ method: "GET", url: `/media/${photo.publicId}/display` });
    expect(res.statusCode).toBe(503);
    expect(res.headers["retry-after"]).toBe("30");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.json()).toMatchObject({ error: "Service Unavailable" });
  });

  it("answers HEAD with headers only", async () => {
    const { service, add } = setup();
    const photo = add(1);
    const res = await server(service).inject({ method: "HEAD", url: `/media/${photo.publicId}/thumb` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(res.rawPayload.length).toBe(0);
  });
});

describe("POST /admin/media/:id/moderate", () => {
  it("requires an approved admin", async () => {
    const { service, add } = setup();
    const photo = add(1);
    const url = `/admin/media/${photo.publicId}/moderate`;
    const payload = { status: "hidden" };
    const app = server(service, fakeAdminAccounts({ tester: "pending" }).store);
    expect((await app.inject({ method: "POST", url, payload })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url, payload, headers: auth })).statusCode).toBe(401);
    const res = await app.inject({ method: "POST", url, payload, headers: { authorization: `Bearer ${await adminToken()}` } });
    expect(res.statusCode).toBe(403);
  });

  it("hides a photo out of the listing and serving at once, restores it, and audits each change", async () => {
    const { service, add, audits } = setup();
    const photo = add(1);
    add(2);
    const app = server(service);
    const admin = { authorization: `Bearer ${await adminToken()}` };
    const moderate = (status: string) =>
      app.inject({ method: "POST", url: `/admin/media/${photo.publicId}/moderate`, payload: { status }, headers: admin });
    const listed = async () =>
      (await app.inject({ method: "GET", url: "/gallery", headers: auth })).json().items.map((i: { publicId: string }) => i.publicId);

    const hidden = await moderate("hidden");
    expect(hidden.statusCode).toBe(200);
    expect(hidden.headers["cache-control"]).toBe("no-store");
    expect(hidden.json()).toEqual({ publicId: photo.publicId, status: "hidden", isPublic: false, revalidateTags: ["gallery"] });
    expect(await listed()).not.toContain(photo.publicId);
    expect((await app.inject({ method: "GET", url: `/media/${photo.publicId}/thumb` })).statusCode).toBe(404);

    expect((await moderate("visible")).statusCode).toBe(200);
    expect(await listed()).toContain(photo.publicId);
    expect((await app.inject({ method: "GET", url: `/media/${photo.publicId}/thumb` })).statusCode).toBe(200);

    expect((await moderate("removed")).statusCode).toBe(200);
    expect(await listed()).not.toContain(photo.publicId);
    expect(audits).toEqual([
      ["tester", photo.publicId, "hidden"],
      ["tester", photo.publicId, "visible"],
      ["tester", photo.publicId, "removed"],
    ]);
  });

  it("answers 404 for an unknown photo and 400 for an unknown status", async () => {
    const { service, add } = setup();
    const photo = add(1);
    const app = server(service);
    const headers = { authorization: `Bearer ${await adminToken()}` };
    expect((await app.inject({ method: "POST", url: "/admin/media/nope/moderate", payload: { status: "hidden" }, headers })).statusCode).toBe(404);
    const bad = await app.inject({ method: "POST", url: `/admin/media/${photo.publicId}/moderate`, payload: { status: "approved" }, headers });
    expect(bad.statusCode).toBe(400);
  });

  it("names the public gallery tag too when a public photo is taken down, and nothing on a no-op", async () => {
    const { service, add } = setup();
    const photo = add(1, { isPublic: true });
    const app = server(service);
    const headers = { authorization: `Bearer ${await adminToken()}` };
    const moderate = (status: string) =>
      app.inject({ method: "POST", url: `/admin/media/${photo.publicId}/moderate`, payload: { status }, headers });
    expect((await moderate("hidden")).json().revalidateTags).toEqual(["gallery", "gallery-public"]);
    expect((await moderate("hidden")).json().revalidateTags).toEqual([]);
  });
});

describe("GET /gallery/public (curated, #75)", () => {
  it("never shows unflagged photos to anonymous visitors", async () => {
    const { service, add } = setup();
    add(1);
    add(2, { isPublic: true });
    add(3);
    const res = await server(service).inject({ method: "GET", url: "/gallery/public" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, s-maxage=60");
    const body = publicGalleryResponseSchema.parse(res.json());
    expect(body.items.map((i) => i.publicId)).toEqual(["pub0000000000000000002"]);
  });

  it("drops a public photo while it is hidden, removed or unprocessed, and brings it back when visible", async () => {
    const { service, add, photos } = setup();
    const photo = add(1, { isPublic: true });
    add(2, { isPublic: true, processing: "pending" });
    add(3, { isPublic: true, moderation: "removed" });
    const app = server(service);
    const listed = async () =>
      (await app.inject({ method: "GET", url: "/gallery/public" })).json().items.map((i: { publicId: string }) => i.publicId);
    expect(await listed()).toEqual([photo.publicId]);
    photos[0]!.moderation = "hidden";
    expect(await listed()).toEqual([]);
    photos[0]!.moderation = "visible";
    expect(await listed()).toEqual([photo.publicId]);
  });

  it("pages like /gallery and rejects a bad limit", async () => {
    const { service, add } = setup();
    for (let n = 1; n <= 3; n++) add(n, { isPublic: true });
    const app = server(service);
    const first = (await app.inject({ method: "GET", url: "/gallery/public?limit=2" })).json();
    expect(first.nextCursor).toBe("pub0000000000000000002");
    const second = (await app.inject({ method: "GET", url: `/gallery/public?limit=2&cursor=${first.nextCursor}` })).json();
    expect(second.items.map((i: { publicId: string }) => i.publicId)).toEqual(["pub0000000000000000001"]);
    expect((await app.inject({ method: "GET", url: "/gallery/public?limit=0" })).statusCode).toBe(400);
  });
});

describe("POST /admin/media/:id/public", () => {
  it("requires an approved admin", async () => {
    const { service, add } = setup();
    const photo = add(1);
    const url = `/admin/media/${photo.publicId}/public`;
    const app = server(service, fakeAdminAccounts({ tester: "pending" }).store);
    expect((await app.inject({ method: "POST", url, payload: { isPublic: true } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url, payload: { isPublic: true }, headers: auth })).statusCode).toBe(401);
    const res = await app.inject({ method: "POST", url, payload: { isPublic: true }, headers: { authorization: `Bearer ${await adminToken()}` } });
    expect(res.statusCode).toBe(403);
  });

  it("flags a visible photo into the public gallery, audits it, and names the tag to revalidate", async () => {
    const { service, add, audits } = setup();
    const photo = add(1);
    const app = server(service);
    const headers = { authorization: `Bearer ${await adminToken()}` };
    const set = (isPublic: boolean) =>
      app.inject({ method: "POST", url: `/admin/media/${photo.publicId}/public`, payload: { isPublic }, headers });

    const on = await set(true);
    expect(on.statusCode).toBe(200);
    expect(on.headers["cache-control"]).toBe("no-store");
    expect(setMediaPublicResponseSchema.parse(on.json())).toEqual({
      publicId: photo.publicId,
      status: "visible",
      isPublic: true,
      revalidateTags: ["gallery-public"],
    });
    expect((await app.inject({ method: "GET", url: "/gallery/public" })).json().items).toHaveLength(1);
    expect((await set(true)).json().revalidateTags).toEqual([]);

    expect((await set(false)).json()).toMatchObject({ isPublic: false, revalidateTags: ["gallery-public"] });
    expect((await app.inject({ method: "GET", url: "/gallery/public" })).json().items).toHaveLength(0);
    expect(audits).toEqual([
      ["tester", photo.publicId, true],
      ["tester", photo.publicId, false],
    ]);
  });

  it("refuses hidden, removed and unprocessed photos with 409, and unknown ones with 404", async () => {
    const { service, add } = setup();
    const app = server(service);
    const headers = { authorization: `Bearer ${await adminToken()}` };
    const cases = [{ moderation: "hidden" as const }, { moderation: "removed" as const }, { processing: "pending" as const }];
    for (const [n, overrides] of cases.entries()) {
      const photo = add(n + 1, overrides);
      const res = await app.inject({ method: "POST", url: `/admin/media/${photo.publicId}/public`, payload: { isPublic: true }, headers });
      expect(res.statusCode).toBe(409);
    }
    expect((await app.inject({ method: "POST", url: "/admin/media/nope/public", payload: { isPublic: true }, headers })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/admin/media/nope/public", payload: { isPublic: "yes" }, headers })).statusCode).toBe(400);
  });
});

describe("GET /admin/media (moderation queue, #64)", () => {
  it("lists every state for admins only, with filters", async () => {
    const { service, add } = setup();
    add(1);
    add(2, { moderation: "hidden" });
    add(3, { moderation: "removed", isPublic: true });
    add(4, { processing: "pending" });
    const app = server(service);
    expect((await app.inject({ method: "GET", url: "/admin/media" })).statusCode).toBe(401);
    const headers = { authorization: `Bearer ${await adminToken()}` };

    const all = await app.inject({ method: "GET", url: "/admin/media", headers });
    expect(all.statusCode).toBe(200);
    expect(all.headers["cache-control"]).toBe("no-store");
    expect(adminMediaResponseSchema.parse(all.json()).items).toHaveLength(4);

    const hidden = (await app.inject({ method: "GET", url: "/admin/media?status=hidden", headers })).json();
    expect(hidden.items.map((i: { status: string }) => i.status)).toEqual(["hidden"]);
    const pending = (await app.inject({ method: "GET", url: "/admin/media?processing=pending", headers })).json();
    expect(pending.items).toHaveLength(1);
    const flagged = (await app.inject({ method: "GET", url: "/admin/media?isPublic=true", headers })).json();
    expect(flagged.items.map((i: { status: string }) => i.status)).toEqual(["removed"]);
    expect((await app.inject({ method: "GET", url: "/admin/media?status=pending", headers })).statusCode).toBe(400);
  });

  it("previews a hidden photo for admins while the public route keeps refusing it", async () => {
    const { service, add } = setup();
    const photo = add(1, { moderation: "hidden" });
    const pending = add(2, { processing: "pending" });
    const app = server(service);
    const headers = { authorization: `Bearer ${await adminToken()}` };
    expect((await app.inject({ method: "GET", url: `/media/${photo.publicId}/thumb` })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/admin/media/${photo.publicId}/thumb` })).statusCode).toBe(401);
    const res = await app.inject({ method: "GET", url: `/admin/media/${photo.publicId}/thumb`, headers });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.rawPayload.equals(JPEG_BYTES)).toBe(true);
    expect((await app.inject({ method: "GET", url: `/admin/media/${pending.publicId}/thumb`, headers })).statusCode).toBe(404);
  });
});
