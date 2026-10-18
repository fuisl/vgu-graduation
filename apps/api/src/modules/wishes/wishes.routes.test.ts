import {
  adminWishesResponseSchema,
  createWishResponseSchema,
  type ModerationStatus,
  publicWishesResponseSchema,
  setWishPublicResponseSchema,
  wishesResponseSchema,
} from "@grad/contract";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import { buildServer } from "../../server.js";
import { approvedTester } from "../admin/admin-accounts.fake.js";
import type { ResolveResult } from "../invitations/invitations.service.js";
import type { ModerateResult, SetWishPublicResult, StoredWish } from "./wishes.repository.js";
import { WishesService } from "./wishes.service.js";

const config = loadConfig({ LOG_LEVEL: "silent" });
const TOKEN = "guest-bearer-token-value";
const INVITATION_ID = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";
const WISH_ID = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e71";

const invitation = {
  id: INVITATION_ID,
  guest: { id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70", name: "Jane", email: null, phone: null },
  maxPlusOnes: 0,
  status: "active" as const,
  validFrom: null,
  validUntil: null,
  inviters: [],
  rsvp: null,
};

/** Real WishesService over an in-memory store. */
function setup(resolve: (token: string) => ResolveResult = (t) => (t === TOKEN ? { status: "ok", invitation } : { status: "invalid" })) {
  const store: (StoredWish & { invitationId: string })[] = [];
  const moderations: [string, string, string][] = [];
  const service = new WishesService(
    { resolveByToken: async (token) => resolve(token) },
    {
      create: async (invitationId, authorName, body) => {
        const row = {
          id: `3f2e8b1a-9c3d-4c9a-8b1e-${String(store.length).padStart(12, "0")}`,
          invitationId,
          authorName,
          body,
          moderationStatus: "visible" as ModerationStatus,
          isPublic: false,
          createdAt: new Date(Date.UTC(2026, 10, 15, 3, 0, store.length)),
        };
        store.push(row);
        return row;
      },
      countSince: async (invitationId) => store.filter((w) => w.invitationId === invitationId).length,
      list: async ({ limit, visibleOnly, publicOnly, status, isPublic }) =>
        [...store]
          .filter((w) => !(visibleOnly || publicOnly) || w.moderationStatus === "visible")
          .filter((w) => !publicOnly || w.isPublic)
          .filter((w) => !status || w.moderationStatus === status)
          .filter((w) => isPublic === undefined || w.isPublic === isPublic)
          .reverse()
          .slice(0, limit + 1),
      moderate: async (id, status, actor): Promise<ModerateResult> => {
        const row = store.find((w) => w.id === id);
        if (!row) return { status: "not_found" };
        const changed = row.moderationStatus !== status;
        if (changed) moderations.push([id, status, actor]);
        row.moderationStatus = status;
        return { status: "ok", wish: row, changed };
      },
      setPublic: async (id, isPublic, actor): Promise<SetWishPublicResult> => {
        const row = store.find((w) => w.id === id);
        if (!row) return { status: "not_found" };
        if (row.isPublic === isPublic) return { status: "ok", wish: row, changed: false };
        if (isPublic && row.moderationStatus !== "visible") return { status: "not_eligible", wish: row };
        moderations.push([id, `public:${isPublic}`, actor]);
        row.isPublic = isPublic;
        return { status: "ok", wish: row, changed: true };
      },
    },
  );
  return { service, store, moderations };
}

const auth = { authorization: `Bearer ${TOKEN}` };

async function adminAuth() {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("tester")
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(config.adminSessionSecret));
  return { authorization: `Bearer ${token}` };
}

function server(service = setup().service) {
  return buildServer({ adminAccounts: approvedTester(), config, wishesService: service });
}

describe("POST /wishes", () => {
  it("returns 401 with no credential", async () => {
    const res = await server().inject({ method: "POST", url: "/wishes", payload: { body: "Hi" } });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for an unknown token and 410 for an expired invitation", async () => {
    const bad = await server().inject({ method: "POST", url: "/wishes", headers: { authorization: "Bearer nope" }, payload: { body: "Hi" } });
    expect(bad.statusCode).toBe(404);
    const expired = await server(setup(() => ({ status: "expired" })).service).inject({ method: "POST", url: "/wishes", headers: auth, payload: { body: "Hi" } });
    expect(expired.statusCode).toBe(410);
  });

  it("rejects empty and over-long bodies", async () => {
    const app = server();
    for (const body of ["   ", "x".repeat(1001)]) {
      const res = await app.inject({ method: "POST", url: "/wishes", headers: auth, payload: { body } });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "Bad Request", message: "Request validation failed" });
    }
  });

  it("creates a trimmed wish under the guest's name, never cached", async () => {
    const res = await server().inject({ method: "POST", url: "/wishes", headers: { cookie: `inv=${TOKEN}` }, payload: { body: "  Congrats!  " } });
    expect(res.statusCode).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(createWishResponseSchema.safeParse(res.json()).success).toBe(true);
    expect(res.json()).toMatchObject({ authorName: "Jane", body: "Congrats!" });
  });

  it("answers 429 with Retry-After once the invitation hits the cap", async () => {
    const app = server();
    for (let i = 0; i < 5; i++) {
      expect((await app.inject({ method: "POST", url: "/wishes", headers: auth, payload: { body: `w${i}` } })).statusCode).toBe(201);
    }
    const res = await app.inject({ method: "POST", url: "/wishes", headers: auth, payload: { body: "one more" } });
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBe("600");
    expect(res.json()).toMatchObject({ error: "Too Many Requests" });
  });
});

describe("GET /wishes", () => {
  it("lists only visible wishes, publicly cacheable, without invitation data", async () => {
    const { service, store } = setup();
    const app = server(service);
    await app.inject({ method: "POST", url: "/wishes", headers: auth, payload: { body: "shown" } });
    await app.inject({ method: "POST", url: "/wishes", headers: auth, payload: { body: "hidden" } });
    store[1].moderationStatus = "hidden";

    const res = await app.inject({ method: "GET", url: "/wishes" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toMatch(/^public/);
    expect(wishesResponseSchema.safeParse(res.json()).success).toBe(true);
    expect(res.json().items.map((w: { body: string }) => w.body)).toEqual(["shown"]);
    expect(res.body).not.toContain(INVITATION_ID);
    expect(res.body).not.toContain("moderation");
  });

  it("rejects a malformed cursor and an out-of-range limit", async () => {
    const app = server();
    expect((await app.inject({ method: "GET", url: "/wishes?cursor=garbage" })).json()).toEqual({ error: "Bad Request", message: "Invalid cursor" });
    expect((await app.inject({ method: "GET", url: "/wishes?limit=500" })).statusCode).toBe(400);
  });
});

describe("admin wishes", () => {
  it("requires an admin session", async () => {
    const app = server();
    expect((await app.inject({ method: "GET", url: "/admin/wishes", headers: auth })).statusCode).toBe(401);
    const res = await app.inject({ method: "POST", url: `/admin/wishes/${WISH_ID}/moderate`, headers: auth, payload: { status: "hidden" } });
    expect(res.statusCode).toBe(401);
  });

  it("hides a wish, removes it from the public list and keeps it in the admin list", async () => {
    const { service, store, moderations } = setup();
    const app = server(service);
    await app.inject({ method: "POST", url: "/wishes", headers: auth, payload: { body: "hello" } });
    const id = store[0].id;

    const res = await app.inject({ method: "POST", url: `/admin/wishes/${id}/moderate`, headers: await adminAuth(), payload: { status: "hidden" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id, status: "hidden", isPublic: false, revalidateTags: ["wishes"] });
    expect(moderations).toEqual([[id, "hidden", "tester"]]);

    expect((await app.inject({ method: "GET", url: "/wishes" })).json().items).toEqual([]);
    const admin = await app.inject({ method: "GET", url: "/admin/wishes", headers: await adminAuth() });
    expect(admin.headers["cache-control"]).toBe("no-store");
    expect(adminWishesResponseSchema.safeParse(admin.json()).success).toBe(true);
    expect(admin.json().items[0]).toMatchObject({ id, status: "hidden" });
  });

  it("rejects unknown ids, bad ids and unknown states", async () => {
    const app = server();
    const headers = await adminAuth();
    expect((await app.inject({ method: "POST", url: `/admin/wishes/${WISH_ID}/moderate`, headers, payload: { status: "hidden" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/admin/wishes/42/moderate", headers, payload: { status: "hidden" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: `/admin/wishes/${WISH_ID}/moderate`, headers, payload: { status: "approved" } })).statusCode).toBe(400);
  });

  it("filters the admin list by status and public flag (#64)", async () => {
    const { service, store } = setup();
    const app = server(service);
    for (const body of ["one", "two", "three"]) await app.inject({ method: "POST", url: "/wishes", headers: auth, payload: { body } });
    store[0].moderationStatus = "hidden";
    store[2].isPublic = true;
    const headers = await adminAuth();
    const hidden = (await app.inject({ method: "GET", url: "/admin/wishes?status=hidden", headers })).json();
    expect(hidden.items.map((w: { body: string }) => w.body)).toEqual(["one"]);
    const flagged = (await app.inject({ method: "GET", url: "/admin/wishes?isPublic=true", headers })).json();
    expect(flagged.items).toEqual([expect.objectContaining({ body: "three", isPublic: true })]);
    expect((await app.inject({ method: "GET", url: "/admin/wishes?status=pending", headers })).statusCode).toBe(400);
  });
});

describe("curated public wishes (#75)", () => {
  it("flags a visible wish, lists only flagged ones anonymously, and names the tag to revalidate", async () => {
    const { service, store, moderations } = setup();
    const app = server(service);
    for (const body of ["unflagged", "flagged"]) await app.inject({ method: "POST", url: "/wishes", headers: auth, payload: { body } });
    const id = store[1].id;
    const headers = await adminAuth();

    expect((await app.inject({ method: "GET", url: "/wishes/public" })).json().items).toEqual([]);
    expect((await app.inject({ method: "POST", url: `/admin/wishes/${id}/public`, headers: auth, payload: { isPublic: true } })).statusCode).toBe(401);

    const res = await app.inject({ method: "POST", url: `/admin/wishes/${id}/public`, headers, payload: { isPublic: true } });
    expect(res.statusCode).toBe(200);
    expect(setWishPublicResponseSchema.parse(res.json())).toEqual({ id, status: "visible", isPublic: true, revalidateTags: ["wishes-public"] });

    const listed = await app.inject({ method: "GET", url: "/wishes/public" });
    expect(listed.headers["cache-control"]).toBe("public, s-maxage=30, stale-while-revalidate=30");
    expect(publicWishesResponseSchema.parse(listed.json()).items.map((w) => w.body)).toEqual(["flagged"]);

    // Hiding a public wish names both tags and drops it from the public list.
    const hidden = await app.inject({ method: "POST", url: `/admin/wishes/${id}/moderate`, headers, payload: { status: "hidden" } });
    expect(hidden.json().revalidateTags).toEqual(["wishes", "wishes-public"]);
    expect((await app.inject({ method: "GET", url: "/wishes/public" })).json().items).toEqual([]);
    expect(moderations).toEqual([
      [id, "public:true", "tester"],
      [id, "hidden", "tester"],
    ]);
  });

  it("refuses to flag a hidden wish and 404s an unknown one", async () => {
    const { service, store } = setup();
    const app = server(service);
    await app.inject({ method: "POST", url: "/wishes", headers: auth, payload: { body: "x" } });
    store[0].moderationStatus = "removed";
    const headers = await adminAuth();
    expect((await app.inject({ method: "POST", url: `/admin/wishes/${store[0].id}/public`, headers, payload: { isPublic: true } })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: `/admin/wishes/${store[0].id}/public`, headers, payload: { isPublic: false } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `/admin/wishes/${WISH_ID}/public`, headers, payload: { isPublic: true } })).statusCode).toBe(404);
  });
});

describe("token hygiene in logs", () => {
  it("never writes the bearer token or cookie to the log", async () => {
    const lines: string[] = [];
    const app = buildServer({
      adminAccounts: approvedTester(),
      config: { ...config, logLevel: "trace" },
      logStream: { write: (line) => void lines.push(line) },
      wishesService: setup().service,
    });
    await app.inject({ method: "POST", url: "/wishes", headers: auth, payload: { body: "Hi" } });
    await app.inject({ method: "POST", url: "/wishes", headers: { cookie: `inv=${TOKEN}` }, payload: { body: "Hi" } });
    await app.close();
    const output = lines.join("");
    expect(output).toContain("/wishes");
    expect(output).not.toContain(TOKEN);
  });
});
