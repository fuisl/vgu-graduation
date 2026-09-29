import { afterEach, describe, expect, it, vi } from "vitest";
import { putRsvp } from "./rsvp";

const rsvp = {
  id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
  attending: true,
  plusOnesCount: 1,
  dietaryRequirements: null,
  notes: null,
  updatedAt: "2026-10-01T00:00:00.000Z",
};
const request = { attending: true, plusOnesCount: 1 };

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}), ...response });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("putRsvp", () => {
  it("sends a no-store PUT with the bearer token and returns the parsed RSVP", async () => {
    const fn = mockFetch({ json: async () => rsvp });
    const result = await putRsvp("tok", request);
    expect(result).toEqual({ status: "ok", data: rsvp });
    const [url, init] = fn.mock.calls[0]!;
    expect(url).toMatch(/\/rsvp$/);
    expect(init).toMatchObject({ method: "PUT", cache: "no-store", body: JSON.stringify(request) });
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("surfaces the API message on 400", async () => {
    mockFetch({ ok: false, status: 400, json: async () => ({ message: "Too many plus-ones" }) });
    expect(await putRsvp("tok", request)).toMatchObject({
      status: "error",
      kind: "http",
      httpStatus: 400,
      message: "Too many plus-ones",
    });
  });

  it("falls back to a generic 400 message when the body is not JSON", async () => {
    mockFetch({
      ok: false,
      status: 400,
      json: async () => {
        throw new Error("bad json");
      },
    });
    expect(await putRsvp("tok", request)).toMatchObject({ httpStatus: 400, message: "The API rejected the request" });
  });

  it.each([404, 410, 500])("returns an http error carrying %i", async (status) => {
    mockFetch({ ok: false, status });
    expect(await putRsvp("tok", request)).toMatchObject({ status: "error", kind: "http", httpStatus: status });
  });

  it("returns a validation error on an unexpected body", async () => {
    mockFetch({ json: async () => ({ nonsense: true }) });
    expect(await putRsvp("tok", request)).toMatchObject({ status: "error", kind: "validation" });
  });

  it("returns a network error when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await putRsvp("tok", request)).toMatchObject({ status: "error", kind: "network" });
  });
});
