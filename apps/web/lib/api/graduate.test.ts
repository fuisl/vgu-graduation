import { afterEach, describe, expect, it, vi } from "vitest";
import { createGraduateSession, endGraduateSession, getGraduateGuests, getGraduateMe, inviteGraduateGuest, removeGraduateGuest } from "./graduate";

const SESSION = "session-token-0123456789";
const GUEST = {
  id: "9b2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
  name: "Bao Tran",
  email: "bao@example.com",
  status: "pending",
  answeredAt: null,
  soleInviter: true,
};

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}), ...response });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("reads", () => {
  it("sends the session as a Bearer header, never cached, and validates the body", async () => {
    const fn = mockFetch({ json: async () => ({ items: [GUEST] }) });
    expect(await getGraduateGuests(SESSION)).toEqual({ status: "ok", data: { items: [GUEST] } });
    const [url, init] = fn.mock.calls[0]!;
    expect(url).toMatch(/\/graduate\/guests$/);
    expect(init).toMatchObject({ cache: "no-store", headers: { Authorization: `Bearer ${SESSION}` } });
  });

  it("refuses a body with extra fields, so nothing the dashboard shouldn't have can pass through", async () => {
    mockFetch({ json: async () => ({ items: [{ ...GUEST, accessibility: { wheelchair: true } }] }) });
    expect(await getGraduateGuests(SESSION)).toEqual({ status: "error" });
  });

  it("tells a lost session apart from an API that can't be asked", async () => {
    mockFetch({ ok: false, status: 401 });
    expect(await getGraduateMe(SESSION)).toEqual({ status: "unauthorized" });
    mockFetch({ ok: false, status: 500 });
    expect(await getGraduateMe(SESSION)).toEqual({ status: "error" });
    mockFetch({ json: async () => ({ graduate: {} }) });
    expect(await getGraduateMe(SESSION)).toEqual({ status: "error" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await getGraduateMe(SESSION)).toEqual({ status: "error" });
  });
});

describe("createGraduateSession", () => {
  it("posts the token in the body, not the URL", async () => {
    const data = { token: "new-session-token-012345", expiresAt: "2026-12-01T00:00:00.000Z" };
    const fn = mockFetch({ status: 201, json: async () => data });
    expect(await createGraduateSession("sign-in-token-0123456")).toEqual({ status: "ok", data });
    const [url, init] = fn.mock.calls[0]!;
    expect(url).toMatch(/\/graduate\/sessions$/);
    expect(url).not.toContain("sign-in-token");
    expect(init).toMatchObject({ method: "POST", cache: "no-store", body: JSON.stringify({ token: "sign-in-token-0123456" }) });
  });

  it("separates a dead link from a failed attempt, which can be retried", async () => {
    mockFetch({ ok: false, status: 401 });
    expect(await createGraduateSession("x")).toEqual({ status: "invalid" });
    mockFetch({ ok: false, status: 503 });
    expect(await createGraduateSession("x")).toEqual({ status: "error" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await createGraduateSession("x")).toEqual({ status: "error" });
  });
});

describe("writes", () => {
  it("invites with no join code in the request", async () => {
    const fn = mockFetch({ status: 201, json: async () => ({ status: "invited" }) });
    expect(await inviteGraduateGuest(SESSION, { name: "Bao", email: "bao@example.com" })).toBe("invited");
    const [url, init] = fn.mock.calls[0]!;
    expect(url).toMatch(/\/graduate\/guests$/);
    expect(init.body).toBe(JSON.stringify({ name: "Bao", email: "bao@example.com" }));
  });

  it("says when no email went", async () => {
    mockFetch({ status: 201, json: async () => ({ status: "already_invited" }) });
    expect(await inviteGraduateGuest(SESSION, { name: "Bao", email: "bao@example.com" })).toBe("already_invited");
  });

  it.each([
    [400, "invalid"],
    [401, "signed_out"],
    [429, "limited"],
    [503, "unavailable"],
    [502, "failed"],
  ] as const)("maps invite %i to %s", async (status, outcome) => {
    mockFetch({ ok: false, status });
    expect(await inviteGraduateGuest(SESSION, { name: "Bao", email: "bao@example.com" })).toBe(outcome);
  });

  it("removes with DELETE and reports what happened", async () => {
    const fn = mockFetch({ json: async () => ({ outcome: "unlinked" }) });
    expect(await removeGraduateGuest(SESSION, GUEST.id)).toBe("unlinked");
    expect(fn.mock.calls[0]![0]).toMatch(new RegExp(`/graduate/guests/${GUEST.id}$`));
    expect(fn.mock.calls[0]![1]).toMatchObject({ method: "DELETE", headers: { Authorization: `Bearer ${SESSION}` } });
  });

  it.each([
    [404, "not_found"],
    [401, "signed_out"],
    [429, "limited"],
    [500, "failed"],
  ] as const)("maps remove %i to %s", async (status, outcome) => {
    mockFetch({ ok: false, status });
    expect(await removeGraduateGuest(SESSION, GUEST.id)).toBe(outcome);
  });

  it("counts a session that is already gone as signed out, and an unreachable API as not", async () => {
    mockFetch({ ok: false, status: 401 });
    expect(await endGraduateSession(SESSION)).toBe(true);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await endGraduateSession(SESSION)).toBe(false);
  });
});
