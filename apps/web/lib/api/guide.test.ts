import { afterEach, describe, expect, it, vi } from "vitest";
import { hashToken } from "./client";
import { getGuide, guideCacheTag } from "./guide";

const guide = {
  tailored: true,
  items: [
    {
      id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
      title: "Lake walk",
      category: "relax",
      description: "A quiet loop around the lake.",
      mapUrl: "https://maps.example.test/lake",
      timeHint: "20 min",
      sortOrder: 1,
    },
  ],
};

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}), ...response });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("getGuide", () => {
  it("sends the bearer token, revalidates every 300s under a hashed tag and parses the guide", async () => {
    const fn = mockFetch({ json: async () => guide });
    expect(await getGuide("tok")).toEqual({ status: "ok", data: guide });
    const [url, init] = fn.mock.calls[0]!;
    expect(url).toMatch(/\/invitations\/me\/guide$/);
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(init.next).toEqual({ revalidate: 300, tags: [`guide:${await hashToken("tok")}`] });
  });

  it("never puts the raw token in the cache tag", async () => {
    const tag = await guideCacheTag("secret-token");
    expect(tag).toMatch(/^guide:[0-9a-f]{64}$/);
    expect(tag).not.toContain("secret-token");
  });

  it.each([401, 404])("is empty on %i", async (status) => {
    mockFetch({ ok: false, status });
    expect(await getGuide("tok")).toEqual({ status: "empty" });
  });

  it.each([410, 500])("returns an http error carrying %i", async (status) => {
    mockFetch({ ok: false, status });
    expect(await getGuide("tok")).toMatchObject({ status: "error", kind: "http", httpStatus: status });
  });

  it("returns a validation error on an unexpected body", async () => {
    mockFetch({ json: async () => ({ items: "nope" }) });
    expect(await getGuide("tok")).toMatchObject({ status: "error", kind: "validation" });
  });

  it("returns a network error when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await getGuide("tok")).toMatchObject({ status: "error", kind: "network" });
  });
});
