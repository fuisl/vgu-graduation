import { SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config.js";
import { buildServer } from "../../server.js";
import { approvedTester } from "../admin/admin-accounts.fake.js";
import { SlidingWindowLimiter } from "../mail/rate-limit.js";
import type { JoinRoutesOptions } from "./join.routes.js";
import type { RegisterOutcome } from "./join.service.js";

const config = loadConfig({ LOG_LEVEL: "silent" });
const CODE = "code-ann-123";
const ADDRESS = "someone.private@example.com";
const GRADUATE_ID = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";

type Service = NonNullable<JoinRoutesOptions["service"]>;

function setup(overrides: Partial<Service> = {}, limits: { link?: number; join?: number } = {}) {
  const lines: string[] = [];
  const service = {
    mailEnabled: true,
    info: vi.fn(async (code: string) => (code === CODE ? { graduate: { name: "Ann Nguyen", givenName: "Ann" } } : null)),
    requestLink: vi.fn(async () => "sent" as const),
    register: vi.fn(async (code: string): Promise<RegisterOutcome> => (code === CODE ? "registered" : "unknown_code")),
    rotate: vi.fn(async (id: string) => (id === GRADUATE_ID ? `${config.publicOrigin}/join/new-code-1` : null)),
    ...overrides,
  } as Service & Record<string, ReturnType<typeof vi.fn>>;
  const app = buildServer({
    adminAccounts: approvedTester(),
    config: { ...config, logLevel: "info" },
    logStream: { write: (line) => void lines.push(line) },
    join: {
      service,
      linkLimiter: new SlidingWindowLimiter(limits.link ?? 3, 60_000),
      joinLimiter: new SlidingWindowLimiter(limits.join ?? 60, 60_000),
    },
  });
  return { app, service, lines };
}

async function adminHeaders() {
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("tester")
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(config.adminSessionSecret));
  return { authorization: `Bearer ${jwt}` };
}

describe("POST /join-links/request", () => {
  it("answers 202 and asks the service to mail the link, without logging the address", async () => {
    const { app, service, lines } = setup();
    const res = await app.inject({ method: "POST", url: "/join-links/request", payload: { email: ` ${ADDRESS.toUpperCase()} `, locale: "vi" } });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ status: "accepted" });
    expect(res.headers["cache-control"]).toBe("no-store");
    await vi.waitFor(() => expect(service.requestLink).toHaveBeenCalledWith({ email: ADDRESS, locale: "vi" }));
    expect(lines.join("\n")).not.toContain(ADDRESS);
  });

  it("answers the same 202 for a stranger and quietly drops requests over the per-address limit", async () => {
    const { app, service } = setup({ requestLink: vi.fn(async () => "not_graduate" as const) }, { link: 2 });
    for (let i = 0; i < 4; i++) {
      const res = await app.inject({ method: "POST", url: "/join-links/request", payload: { email: ADDRESS } });
      expect(res.statusCode).toBe(202);
    }
    expect(service.requestLink).toHaveBeenCalledTimes(2);
  });

  it("is 503 while mail is off and 400 for a malformed address", async () => {
    expect((await setup({ mailEnabled: false }).app.inject({ method: "POST", url: "/join-links/request", payload: { email: ADDRESS } })).statusCode).toBe(503);
    expect((await setup().app.inject({ method: "POST", url: "/join-links/request", payload: { email: "nope" } })).statusCode).toBe(400);
  });
});

describe("GET /join/:code", () => {
  it("names the inviting graduate, and is 404 for an unknown or malformed code", async () => {
    const { app } = setup();
    const res = await app.inject({ method: "GET", url: `/join/${CODE}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ graduate: { name: "Ann Nguyen", givenName: "Ann" } });
    expect(res.headers["cache-control"]).toBe("no-store");
    expect((await app.inject({ method: "GET", url: "/join/unknown-code-9" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/join/a%20b" })).statusCode).toBe(400);
  });
});

describe("POST /join/:code", () => {
  const payload = { name: "Bao Tran", email: ADDRESS };

  it("registers a guest with 201, never logging the address", async () => {
    const { app, service, lines } = setup();
    const res = await app.inject({ method: "POST", url: `/join/${CODE}`, payload });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ status: "registered" });
    expect(service.register).toHaveBeenCalledWith(CODE, payload);
    expect(lines.join("\n")).not.toContain(ADDRESS);
    expect(lines.join("\n")).not.toContain("Bao Tran");
  });

  it("maps the service outcomes to 404, 502 and 503", async () => {
    expect((await setup().app.inject({ method: "POST", url: "/join/unknown-code-9", payload })).statusCode).toBe(404);
    const failed = setup({ register: vi.fn(async (): Promise<RegisterOutcome> => "send_failed") });
    expect((await failed.app.inject({ method: "POST", url: `/join/${CODE}`, payload })).statusCode).toBe(502);
    expect((await setup({ mailEnabled: false }).app.inject({ method: "POST", url: `/join/${CODE}`, payload })).statusCode).toBe(503);
  });

  it("limits registrations per link, refunding the ones that did not register", async () => {
    const { app } = setup({}, { join: 2 });
    expect((await app.inject({ method: "POST", url: "/join/unknown-code-9", payload })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/join/unknown-code-9", payload })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `/join/${CODE}`, payload })).statusCode).toBe(201);
    expect((await app.inject({ method: "POST", url: `/join/${CODE}`, payload })).statusCode).toBe(201);
    expect((await app.inject({ method: "POST", url: `/join/${CODE}`, payload })).statusCode).toBe(429);
  });

  it("rejects a missing name or a malformed address", async () => {
    const { app } = setup();
    expect((await app.inject({ method: "POST", url: `/join/${CODE}`, payload: { email: ADDRESS } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: `/join/${CODE}`, payload: { name: "Bao", email: "x" } })).statusCode).toBe(400);
  });
});

describe("POST /admin/graduates/:id/join-link", () => {
  it("returns a fresh link for admins only, 404 for an unknown graduate", async () => {
    const { app } = setup();
    expect((await app.inject({ method: "POST", url: `/admin/graduates/${GRADUATE_ID}/join-link` })).statusCode).toBe(401);
    const headers = await adminHeaders();
    const res = await app.inject({ method: "POST", url: `/admin/graduates/${GRADUATE_ID}/join-link`, headers });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ joinUrl: `${config.publicOrigin}/join/new-code-1` });
    const unknown = await app.inject({ method: "POST", url: "/admin/graduates/00000000-0000-4000-8000-000000000000/join-link", headers });
    expect(unknown.statusCode).toBe(404);
  });
});
