import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SESSION = "session-token-0123456789";
const ID = "9b2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";
const LIST = { items: [{ id: ID, name: "Bao Tran", email: "bao@example.com", status: "pending", answeredAt: null, soleInviter: true }] };

const store = {
  get: vi.fn((name: string) => (name === "grad_portal" ? { value: SESSION } : undefined)),
  set: vi.fn(),
  delete: vi.fn(),
};
vi.mock("next/headers", () => ({ cookies: async () => store }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

const { confirmGraduateSignIn, inviteGuest, removeGuest, signOutGraduate } = await import("./actions");

/** Answers by method and path; a missing route is a network failure. */
function api(routes: Record<string, { status: number; body?: unknown }>) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const route = routes[`${init?.method ?? "GET"} ${new URL(url).pathname}`];
    if (!route) throw new Error("offline");
    return { ok: route.status < 400, status: route.status, json: async () => route.body };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  store.get.mockImplementation((name: string) => (name === "grad_portal" ? { value: SESSION } : undefined));
  store.set.mockClear();
  store.delete.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("a write returns the fresh list, so the page never waits on a router refresh", () => {
  it("invite: the answer and the list", async () => {
    api({ "POST /graduate/guests": { status: 201, body: { status: "invited" } }, "GET /graduate/guests": { status: 200, body: LIST } });
    expect(await inviteGuest("Bao Tran", "bao@example.com")).toEqual({ outcome: "invited", guests: LIST.items });
  });

  it("invite: a failed re-read still reports the invite that went out", async () => {
    api({ "POST /graduate/guests": { status: 201, body: { status: "invited" } } });
    expect(await inviteGuest("Bao Tran", "bao@example.com")).toEqual({ outcome: "invited", guests: null });
  });

  it("invite: nothing changed, so nothing is read again", async () => {
    const fn = api({ "POST /graduate/guests": { status: 429 } });
    expect(await inviteGuest("Bao Tran", "bao@example.com")).toEqual({ outcome: "limited", guests: null });
    expect(fn).toHaveBeenCalledOnce();
  });

  it("remove: the answer and the list; a limited or failed one reads nothing", async () => {
    api({ [`DELETE /graduate/guests/${ID}`]: { status: 200, body: { outcome: "revoked" } }, "GET /graduate/guests": { status: 200, body: { items: [] } } });
    expect(await removeGuest(ID)).toEqual({ outcome: "revoked", guests: [] });
    const limited = api({ [`DELETE /graduate/guests/${ID}`]: { status: 429 } });
    expect(await removeGuest(ID)).toEqual({ outcome: "limited", guests: null });
    expect(limited).toHaveBeenCalledOnce();
  });

  it("refuses a malformed id before any call", async () => {
    const fn = api({});
    expect(await removeGuest("not-a-uuid")).toEqual({ outcome: "not_found", guests: null });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("a lost session", () => {
  it("goes to /graduate, with or without a cookie", async () => {
    api({ "POST /graduate/guests": { status: 401 } });
    await expect(inviteGuest("Bao", "bao@example.com")).rejects.toThrow("redirect:/graduate");
    store.get.mockImplementation(() => undefined);
    await expect(removeGuest(ID)).rejects.toThrow("redirect:/graduate");
  });
});

describe("confirmGraduateSignIn", () => {
  const withSignInCookie = (session = false) =>
    store.get.mockImplementation((name: string) => {
      if (name === "grad_sign_in") return { value: "sign-in-token-0123456" };
      if (name === "grad_portal" && session) return { value: SESSION };
      return undefined;
    });

  it("spends the token, sets a host-only session cookie, drops the pending one and goes to the dashboard", async () => {
    withSignInCookie();
    api({ "POST /graduate/sessions": { status: 201, body: { token: "new-session-token-012345", expiresAt: "2026-12-01T00:00:00.000Z" } } });
    await expect(confirmGraduateSignIn()).rejects.toThrow("redirect:/graduate/dashboard");
    const [name, value, options] = store.set.mock.calls[0]!;
    expect([name, value]).toEqual(["grad_portal", "new-session-token-012345"]);
    expect(options).not.toHaveProperty("domain");
    expect(store.delete).toHaveBeenCalledWith({ name: "grad_sign_in", path: "/graduate/sign-in" });
  });

  it("keeps the pending cookie after a temporary failure, so the same button can try again", async () => {
    withSignInCookie();
    api({});
    expect(await confirmGraduateSignIn()).toBe("failed");
    expect(store.delete).not.toHaveBeenCalled();
  });

  it("says a dead link is dead, unless they are already signed in", async () => {
    withSignInCookie();
    api({ "POST /graduate/sessions": { status: 401 } });
    expect(await confirmGraduateSignIn()).toBe("invalid");

    withSignInCookie(true);
    api({ "POST /graduate/sessions": { status: 401 }, "GET /graduate/me": { status: 200, body: { graduate: { name: "Ann", givenName: "Ann" }, joinUrl: "https://grad26.example.com/join/code-ann-123" } } });
    await expect(confirmGraduateSignIn()).rejects.toThrow("redirect:/graduate/dashboard");
  });
});

describe("signOutGraduate", () => {
  it("drops the cookie even if the API can't be reached", async () => {
    api({});
    await expect(signOutGraduate()).rejects.toThrow("redirect:/graduate");
    expect(store.delete).toHaveBeenCalledWith({ name: "grad_portal", path: "/graduate" });
  });
});
