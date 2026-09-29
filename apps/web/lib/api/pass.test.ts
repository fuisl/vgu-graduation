import { afterEach, describe, expect, it, vi } from "vitest";
import { getPass } from "./pass";

const pass = {
  payload: {
    v: 1,
    invitationId: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
    guestName: "Nguyễn Thị Ánh",
    validFrom: null,
    validUntil: null,
  },
  signature: "c2ln",
  keyId: "k1",
};

function mockFetch(response: Partial<Response>) {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}), ...response });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("getPass", () => {
  it("returns ok, sending the bearer token with no-store", async () => {
    const fn = mockFetch({ json: async () => pass });
    const result = await getPass("tok");
    expect(result).toEqual({ status: "ok", data: pass });
    const init = fn.mock.calls[0]![1];
    expect(init.cache).toBe("no-store");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("maps 401/404 to empty", async () => {
    mockFetch({ ok: false, status: 401 });
    expect((await getPass("t")).status).toBe("empty");
    mockFetch({ ok: false, status: 404 });
    expect((await getPass("t")).status).toBe("empty");
  });

  it("maps other statuses to an http error", async () => {
    mockFetch({ ok: false, status: 500 });
    expect(await getPass("t")).toMatchObject({ status: "error", kind: "http", httpStatus: 500 });
  });

  it("maps a network failure to a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    expect(await getPass("t")).toMatchObject({ status: "error", kind: "network" });
  });

  it("maps a bad shape or bad JSON to a validation error", async () => {
    mockFetch({ json: async () => ({ nope: true }) });
    expect(await getPass("t")).toMatchObject({ status: "error", kind: "validation" });
    mockFetch({
      json: async () => {
        throw new Error("bad json");
      },
    });
    expect(await getPass("t")).toMatchObject({ status: "error", kind: "validation" });
  });

  it("never includes the token in an error result", async () => {
    mockFetch({ ok: false, status: 500 });
    expect(JSON.stringify(await getPass("secret-token"))).not.toContain("secret-token");
  });
});
