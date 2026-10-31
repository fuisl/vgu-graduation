import { afterEach, describe, expect, it, vi } from "vitest";
import { getJoinInfo, registerGuest, requestJoinLink } from "./join";

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}), ...response });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("getJoinInfo", () => {
  it("reads GET /join/{code} uncached and validates the body", async () => {
    const fn = mockFetch({ json: async () => ({ graduate: { name: "Ann Nguyen", givenName: "Ann" } }) });
    expect(await getJoinInfo("code-ann-123")).toEqual({ status: "ok", data: { graduate: { name: "Ann Nguyen", givenName: "Ann" } } });
    const [url, init] = fn.mock.calls[0]!;
    expect(url).toMatch(/\/join\/code-ann-123$/);
    expect(init).toMatchObject({ cache: "no-store" });
  });

  it("tells an unknown code apart from an API that can't be asked", async () => {
    mockFetch({ ok: false, status: 404 });
    expect(await getJoinInfo("code-ann-123")).toEqual({ status: "unknown" });
    mockFetch({ ok: false, status: 500 });
    expect(await getJoinInfo("code-ann-123")).toEqual({ status: "error" });
    mockFetch({ json: async () => ({ graduate: {} }) });
    expect(await getJoinInfo("code-ann-123")).toEqual({ status: "error" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await getJoinInfo("code-ann-123")).toEqual({ status: "error" });
  });
});

describe("registerGuest", () => {
  it("posts the name and email, never cached", async () => {
    const fn = mockFetch({ status: 201 });
    expect(await registerGuest("code-ann-123", { name: "Bao", email: "bao@example.com" })).toBe("registered");
    const [url, init] = fn.mock.calls[0]!;
    expect(url).toMatch(/\/join\/code-ann-123$/);
    expect(init).toMatchObject({ method: "POST", cache: "no-store", body: JSON.stringify({ name: "Bao", email: "bao@example.com" }) });
  });

  it.each([
    [400, "invalid"],
    [404, "unknown"],
    [429, "limited"],
    [503, "unavailable"],
    [502, "failed"],
  ] as const)("maps %i to %s", async (status, outcome) => {
    mockFetch({ ok: false, status });
    expect(await registerGuest("code-ann-123", { name: "Bao", email: "bao@example.com" })).toBe(outcome);
  });
});

describe("requestJoinLink", () => {
  it("posts the address and the site language", async () => {
    const fn = mockFetch({ status: 202 });
    expect(await requestJoinLink("ann@example.com", "vi")).toBe("accepted");
    expect(fn.mock.calls[0]![1]).toMatchObject({ method: "POST", body: JSON.stringify({ email: "ann@example.com", locale: "vi" }) });
  });

  it.each([
    [400, "invalid"],
    [503, "unavailable"],
    [500, "failed"],
  ] as const)("maps %i to %s", async (status, outcome) => {
    mockFetch({ ok: false, status });
    expect(await requestJoinLink("ann@example.com", "en")).toBe(outcome);
  });
});
