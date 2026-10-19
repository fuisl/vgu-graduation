import { adminGuideItemSchema, adminInvitationGuideResponseSchema, guestGuideResponseSchema } from "@grad/contract";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import { buildServer } from "../../server.js";
import { approvedTester } from "../admin/admin-accounts.fake.js";
import type { ResolveResult } from "../invitations/invitations.service.js";
import type { StoredGuideItem } from "./guide.repository.js";
import { GuideService } from "./guide.service.js";

const config = loadConfig({ LOG_LEVEL: "silent" });
const TOKEN = "guest-bearer-token-value";
const INVITATION_ID = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";
const auth = { authorization: `Bearer ${TOKEN}` };
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

async function adminHeaders() {
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("tester")
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(config.adminSessionSecret));
  return { authorization: `Bearer ${jwt}` };
}

const item = (n: number, overrides: Partial<StoredGuideItem> = {}): StoredGuideItem => ({
  id: `3f2e8b1a-9c3d-4c9a-8b1e-${String(n).padStart(12, "0")}`,
  title: `Item ${n}`,
  category: "explore",
  description: "",
  mapUrl: null,
  timeHint: null,
  sortOrder: n,
  active: true,
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  ...overrides,
});

/** Real GuideService over an in-memory catalogue and pick table. */
function setup(resolve: (t: string) => ResolveResult = (t) => (t === TOKEN ? { status: "ok", invitation } : { status: "invalid" })) {
  const items: StoredGuideItem[] = [item(1), item(2), item(3, { active: false })];
  const picks = new Map<string, string[]>();
  const audits: string[] = [];
  const sorted = () => [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  const service = new GuideService(
    { resolveByToken: async (t) => resolve(t) },
    {
      listItems: async ({ activeOnly }) => sorted().filter((i) => !activeOnly || i.active),
      createItem: async (dto, actor) => {
        const created = { ...item(items.length + 1), ...dto };
        items.push(created);
        audits.push(`create:${actor}`);
        return created;
      },
      updateItem: async (id, dto, actor) => {
        const found = items.find((i) => i.id === id);
        if (!found) return null;
        Object.assign(found, dto);
        audits.push(`update:${actor}`);
        return found;
      },
      deleteItem: async (id, actor) => {
        const index = items.findIndex((i) => i.id === id);
        if (index < 0) return false;
        items.splice(index, 1);
        audits.push(`delete:${actor}`);
        return true;
      },
      selection: async (invitationId) => (invitationId === INVITATION_ID ? (picks.get(invitationId) ?? []) : null),
      setSelection: async (invitationId, ids, actor) => {
        if (invitationId !== INVITATION_ID) return { status: "not_found" };
        if (ids.some((id) => !items.some((i) => i.id === id))) return { status: "unknown_items" };
        picks.set(invitationId, ids);
        audits.push(`select:${actor}`);
        return { status: "ok" };
      },
      selectedActiveItems: async (invitationId) =>
        sorted().filter((i) => i.active && (picks.get(invitationId) ?? []).includes(i.id)),
    },
  );
  return { service, items, audits };
}

function server(service = setup().service) {
  return buildServer({ adminAccounts: approvedTester(), config, guideService: service });
}

describe("GET /invitations/me/guide", () => {
  it("needs a valid invitation", async () => {
    const app = server();
    expect((await app.inject({ method: "GET", url: "/invitations/me/guide" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/invitations/me/guide", headers: { authorization: "Bearer nope" } })).statusCode).toBe(404);
    const expired = server(setup(() => ({ status: "expired" })).service);
    expect((await expired.inject({ method: "GET", url: "/invitations/me/guide", headers: auth })).statusCode).toBe(410);
  });

  it("never lets a cache keep a refusal", async () => {
    const app = server();
    const missing = await app.inject({ method: "GET", url: "/invitations/me/guide" });
    const revoked = await app.inject({ method: "GET", url: "/invitations/me/guide", headers: { authorization: "Bearer nope" } });
    const expired = await server(setup(() => ({ status: "expired" })).service).inject({ method: "GET", url: "/invitations/me/guide", headers: auth });
    for (const res of [missing, revoked, expired]) expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("shows every active item by default, never stored by any cache", async () => {
    const res = await server().inject({ method: "GET", url: "/invitations/me/guide", headers: { cookie: `inv=${TOKEN}` } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    const guide = guestGuideResponseSchema.parse(res.json());
    expect(guide.tailored).toBe(false);
    expect(guide.items.map((i) => i.title)).toEqual(["Item 1", "Item 2"]);
    expect(res.body).not.toContain("active");
  });

  it("shows the graduates' picks once there are active ones", async () => {
    const { service, items } = setup();
    const app = server(service);
    const headers = await adminHeaders();
    const put = (itemIds: string[]) => app.inject({ method: "PUT", url: `/admin/invitations/${INVITATION_ID}/guide`, headers, payload: { itemIds } });

    expect((await put([items[1]!.id])).statusCode).toBe(200);
    const tailored = (await app.inject({ method: "GET", url: "/invitations/me/guide", headers: auth })).json();
    expect(tailored).toMatchObject({ tailored: true, items: [{ title: "Item 2" }] });

    // Only an inactive item picked: back to the defaults.
    await put([items[2]!.id]);
    expect((await app.inject({ method: "GET", url: "/invitations/me/guide", headers: auth })).json().tailored).toBe(false);
  });
});

describe("admin guide routes", () => {
  it("are admin only", async () => {
    const app = server();
    expect((await app.inject({ method: "GET", url: "/admin/guide/items" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/admin/guide/items", headers: auth })).statusCode).toBe(401);
    expect((await app.inject({ method: "PUT", url: `/admin/invitations/${INVITATION_ID}/guide`, headers: auth, payload: { itemIds: [] } })).statusCode).toBe(401);
  });

  it("lists, creates, updates and deletes catalogue items with the admin as actor", async () => {
    const { service, audits } = setup();
    const app = server(service);
    const headers = await adminHeaders();

    const list = await app.inject({ method: "GET", url: "/admin/guide/items", headers });
    expect(list.headers["cache-control"]).toBe("no-store");
    expect(list.json().items).toHaveLength(3);

    const created = await app.inject({
      method: "POST",
      url: "/admin/guide/items",
      headers,
      payload: { title: "Lakeside", category: "relax", mapUrl: "https://maps.example.test/lake" },
    });
    expect(created.statusCode).toBe(201);
    const body = adminGuideItemSchema.parse(created.json());
    expect(body).toMatchObject({ title: "Lakeside", active: true, timeHint: null });

    const updated = await app.inject({ method: "PATCH", url: `/admin/guide/items/${body.id}`, headers, payload: { active: false, timeHint: "15 min" } });
    expect(updated.json()).toMatchObject({ active: false, timeHint: "15 min" });
    expect((await app.inject({ method: "PATCH", url: `/admin/guide/items/${body.id}`, headers, payload: {} })).statusCode).toBe(400);

    const deleted = await app.inject({ method: "DELETE", url: `/admin/guide/items/${body.id}`, headers });
    expect(deleted.statusCode).toBe(204);
    expect((await app.inject({ method: "DELETE", url: `/admin/guide/items/${body.id}`, headers })).statusCode).toBe(404);
    expect(audits).toEqual(["create:tester", "update:tester", "delete:tester"]);
  });

  it("rejects bad items", async () => {
    const app = server();
    const headers = await adminHeaders();
    const post = (payload: object) => app.inject({ method: "POST", url: "/admin/guide/items", headers, payload });
    expect((await post({ title: "", category: "explore" })).statusCode).toBe(400);
    expect((await post({ title: "Gate", category: "nightlife" })).statusCode).toBe(400);
    expect((await post({ title: "Gate", category: "photo-spot", mapUrl: "javascript:alert(1)" })).statusCode).toBe(400);
  });

  it("reads and replaces an invitation's picks", async () => {
    const { service, items } = setup();
    const app = server(service);
    const headers = await adminHeaders();
    const url = `/admin/invitations/${INVITATION_ID}/guide`;

    const before = adminInvitationGuideResponseSchema.parse((await app.inject({ method: "GET", url, headers })).json());
    expect(before).toMatchObject({ selectedItemIds: [], effective: { tailored: false } });

    const after = await app.inject({ method: "PUT", url, headers, payload: { itemIds: [items[0]!.id] } });
    expect(after.json()).toMatchObject({ selectedItemIds: [items[0]!.id], effective: { tailored: true } });

    expect((await app.inject({ method: "PUT", url, headers, payload: { itemIds: ["3f2e8b1a-9c3d-4c9a-8b1e-999999999999"] } })).statusCode).toBe(400);
    const other = "/admin/invitations/3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e77/guide";
    expect((await app.inject({ method: "GET", url: other, headers })).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: other, headers, payload: { itemIds: [] } })).statusCode).toBe(404);
  });
});
