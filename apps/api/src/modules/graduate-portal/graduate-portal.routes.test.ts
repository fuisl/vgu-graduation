import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config.js";
import { buildServer } from "../../server.js";
import { approvedTester } from "../admin/admin-accounts.fake.js";
import type { GraduateInviteOutcome } from "../join/join.service.js";
import { SlidingWindowLimiter } from "../../rate-limit/sliding-window.js";
import type { GraduatePortalRoutesOptions } from "./graduate-portal.routes.js";

const config = loadConfig({ LOG_LEVEL: "silent" });
const SESSION = "session-token-0123456789";
const SIGN_IN = "sign-in-token-0123456789";
const ADDRESS = "someone.private@example.com";
const GUEST_NAME = "Bao Tran";
const GRADUATE = { sessionId: "1f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f", id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f", name: "Ann Nguyen", givenName: "Ann", joinCode: "code-ann-123" };
const INVITATION = "9b2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";
const headers = { authorization: `Bearer ${SESSION}` };

type Service = NonNullable<GraduatePortalRoutesOptions["service"]>;

function setup(overrides: Partial<Service> = {}, limits: { invite?: number; daily?: number; remove?: number } = {}) {
  const lines: string[] = [];
  const service = {
    mailEnabled: true,
    signIn: vi.fn(async (token: string) => (token === SIGN_IN ? { token: "new-session-token-012345", expiresAt: "2026-12-01T00:00:00.000Z" } : null)),
    authenticate: vi.fn(async (token: string) => (token === SESSION ? GRADUATE : null)),
    signOut: vi.fn(async () => {}),
    me: vi.fn(async () => ({ graduate: { name: "Ann Nguyen", givenName: "Ann" }, joinUrl: `${config.publicOrigin}/join/code-ann-123` })),
    listGuests: vi.fn(async () => [
      { id: INVITATION, name: GUEST_NAME, email: ADDRESS, status: "attending" as const, answeredAt: "2026-11-01T00:00:00.000Z", removal: "revoke" as const },
    ]),
    invite: vi.fn(async (): Promise<GraduateInviteOutcome> => "invited"),
    removeGuest: vi.fn(async (_g: string, id: string) => (id === INVITATION ? ("revoked" as const) : null)),
    ...overrides,
  } as Service & Record<string, ReturnType<typeof vi.fn>>;
  const app = buildServer({
    adminAccounts: approvedTester(),
    config: { ...config, logLevel: "info" },
    logStream: { write: (line) => void lines.push(line) },
    graduatePortal: {
      service,
      inviteLimiter: new SlidingWindowLimiter(limits.invite ?? 20, 60_000),
      inviteDailyLimiter: new SlidingWindowLimiter(limits.daily ?? 300, 60_000),
      removeLimiter: new SlidingWindowLimiter(limits.remove ?? 60, 60_000),
    },
  });
  return { app, service, lines };
}

describe("POST /graduate/sessions", () => {
  it("spends a sign-in token for a session, uncached and unlogged", async () => {
    const { app, lines } = setup();
    const res = await app.inject({ method: "POST", url: "/graduate/sessions", payload: { token: SIGN_IN } });
    expect(res.statusCode).toBe(201);
    expect(res.json().token).toBe("new-session-token-012345");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(lines.join("\n")).not.toContain(SIGN_IN);
    expect(lines.join("\n")).not.toContain("new-session-token-012345");
  });

  it("is 401 for a token it doesn't know and 400 for something that isn't a token", async () => {
    const { app } = setup();
    expect((await app.inject({ method: "POST", url: "/graduate/sessions", payload: { token: "unknown-token-0123456" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/graduate/sessions", payload: { token: "a b" } })).statusCode).toBe(400);
  });
});

describe("the graduate guard", () => {
  const routes = [
    { method: "GET", url: "/graduate/me" },
    { method: "GET", url: "/graduate/guests" },
    { method: "POST", url: "/graduate/guests", payload: { name: GUEST_NAME, email: ADDRESS } },
    { method: "DELETE", url: `/graduate/guests/${INVITATION}` },
    { method: "DELETE", url: "/graduate/sessions/current" },
  ] as const;

  it.each(routes)("$method $url needs a session and touches nothing without one", async (route) => {
    const { app, service } = setup();
    expect((await app.inject(route)).statusCode).toBe(401);
    expect((await app.inject({ ...route, headers: { authorization: "Bearer not-a-session-0123" } })).statusCode).toBe(401);
    expect(service.invite).not.toHaveBeenCalled();
    expect(service.removeGuest).not.toHaveBeenCalled();
    expect(service.signOut).not.toHaveBeenCalled();
  });

  it.each(routes)("$method $url reads no cookie, so no ambient credential opens it", async (route) => {
    const { app, service } = setup();
    for (const cookie of [`grad_portal=${SESSION}`, `inv=${SESSION}`]) {
      expect((await app.inject({ ...route, headers: { cookie } })).statusCode).toBe(401);
    }
    expect(service.authenticate).not.toHaveBeenCalled();
  });
});

describe("GET /graduate/guests and /graduate/me", () => {
  it("lists only what the service returns for the signed-in graduate, no-store and unlogged", async () => {
    const { app, service, lines } = setup();
    const res = await app.inject({ method: "GET", url: "/graduate/guests", headers });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(service.listGuests).toHaveBeenCalledWith(GRADUATE.id);
    expect(Object.keys(res.json().items[0]).sort()).toEqual(["answeredAt", "email", "id", "name", "removal", "status"]);
    const log = lines.join("\n");
    expect(log).not.toContain(ADDRESS);
    expect(log).not.toContain(GUEST_NAME);
    expect(log).not.toContain(SESSION);
  });

  it("gives the name and the existing join link", async () => {
    const res = await setup().app.inject({ method: "GET", url: "/graduate/me", headers });
    expect(res.json()).toEqual({ graduate: { name: "Ann Nguyen", givenName: "Ann" }, joinUrl: `${config.publicOrigin}/join/code-ann-123` });
  });
});

describe("POST /graduate/guests", () => {
  const payload = { name: ` ${GUEST_NAME} `, email: ` ${ADDRESS.toUpperCase()} ` };

  it("invites as the signed-in graduate with no code in the request, never logging the guest", async () => {
    const { app, service, lines } = setup();
    const res = await app.inject({ method: "POST", url: "/graduate/guests", headers, payload });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ status: "invited" });
    expect(service.invite).toHaveBeenCalledWith(GRADUATE.id, { name: GUEST_NAME, email: ADDRESS });
    expect(lines.join("\n")).not.toContain(ADDRESS.split("@")[0]);
    expect(lines.join("\n")).not.toContain(GUEST_NAME);
  });

  it("maps the outcomes", async () => {
    const answer = async (outcome: GraduateInviteOutcome) =>
      setup({ invite: vi.fn(async () => outcome) }).app.inject({ method: "POST", url: "/graduate/guests", headers, payload });
    const already = await answer("already_invited");
    expect(already.statusCode).toBe(201);
    expect(already.json()).toEqual({ status: "already_invited" });
    expect((await answer("send_failed")).statusCode).toBe(502);
    expect((await answer("not_configured")).statusCode).toBe(503);
    const off = await setup({ mailEnabled: false }).app.inject({ method: "POST", url: "/graduate/guests", headers, payload });
    expect(off.statusCode).toBe(503);
    expect((await setup().app.inject({ method: "POST", url: "/graduate/guests", headers, payload: { name: "x", email: "nope" } })).statusCode).toBe(400);
  });

  it("limits per graduate, refunding failed sends", async () => {
    const { app, service } = setup({ invite: vi.fn(async (): Promise<GraduateInviteOutcome> => "send_failed") }, { invite: 1 });
    expect((await app.inject({ method: "POST", url: "/graduate/guests", headers, payload })).statusCode).toBe(502);
    expect((await app.inject({ method: "POST", url: "/graduate/guests", headers, payload })).statusCode).toBe(502);
    vi.mocked(service.invite).mockImplementation(async () => "invited");
    expect((await app.inject({ method: "POST", url: "/graduate/guests", headers, payload })).statusCode).toBe(201);
    expect((await app.inject({ method: "POST", url: "/graduate/guests", headers, payload })).statusCode).toBe(429);
  });

  it("spends the daily budget only on real emails, but an already-invited address still counts per graduate", async () => {
    const already = setup({ invite: vi.fn(async (): Promise<GraduateInviteOutcome> => "already_invited") }, { daily: 1, invite: 2 });
    expect((await already.app.inject({ method: "POST", url: "/graduate/guests", headers, payload })).statusCode).toBe(201);
    expect((await already.app.inject({ method: "POST", url: "/graduate/guests", headers, payload })).statusCode).toBe(201);
    expect((await already.app.inject({ method: "POST", url: "/graduate/guests", headers, payload })).statusCode).toBe(429);

    const daily = setup({}, { daily: 1 });
    expect((await daily.app.inject({ method: "POST", url: "/graduate/guests", headers, payload })).statusCode).toBe(201);
    expect((await daily.app.inject({ method: "POST", url: "/graduate/guests", headers, payload })).statusCode).toBe(429);
  });
});

describe("DELETE /graduate/guests/:id", () => {
  it("answers the outcome for a guest on the list, and logs ids only", async () => {
    const { app, service, lines } = setup();
    const res = await app.inject({ method: "DELETE", url: `/graduate/guests/${INVITATION}`, headers });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ outcome: "revoked" });
    expect(service.removeGuest).toHaveBeenCalledWith(GRADUATE.id, INVITATION);
    expect(lines.join("\n")).toContain(INVITATION);
  });

  it("is 404 for a guest not on the list, 400 for a malformed id, 429 over the limit", async () => {
    const { app } = setup({}, { remove: 2 });
    expect((await app.inject({ method: "DELETE", url: "/graduate/guests/00000000-0000-4000-8000-000000000000", headers })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: "/graduate/guests/nope", headers })).statusCode).toBe(400);
    expect((await app.inject({ method: "DELETE", url: `/graduate/guests/${INVITATION}`, headers })).statusCode).toBe(200);
    expect((await app.inject({ method: "DELETE", url: `/graduate/guests/${INVITATION}`, headers })).statusCode).toBe(429);
  });
});

describe("DELETE /graduate/guests/:id for a guest the organizers added", () => {
  it("is 403 with the service's refusal, and logs ids and the outcome only", async () => {
    const { app, lines } = setup({ removeGuest: vi.fn(async () => "organizer_added" as const) });
    const res = await app.inject({ method: "DELETE", url: `/graduate/guests/${INVITATION}`, headers: { authorization: `Bearer ${SESSION}` } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("Forbidden");
    expect(lines.join("\n")).toContain("organizer_added");
    expect(lines.join("\n")).not.toContain(SESSION);
  });
});

describe("DELETE /graduate/sessions/current", () => {
  it("revokes the session it was called with", async () => {
    const { app, service } = setup();
    expect((await app.inject({ method: "DELETE", url: "/graduate/sessions/current", headers })).statusCode).toBe(204);
    expect(service.signOut).toHaveBeenCalledWith(GRADUATE);
  });
});
