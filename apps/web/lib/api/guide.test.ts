import { afterEach, describe, expect, it, vi } from "vitest";
import { hashToken } from "./client";
import { forgetGuide, getGuide } from "./guide";
import { getInvitation } from "./invitations";
import { resetLastKnownGood } from "./last-known-good";

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

afterEach(() => {
  vi.unstubAllGlobals();
  resetLastKnownGood();
});

describe("getGuide", () => {
  it("sends the bearer token, never uses the Next fetch cache and parses the guide", async () => {
    const fn = mockFetch({ json: async () => guide });
    expect(await getGuide("tok")).toEqual({ status: "ok", data: guide });
    const [url, init] = fn.mock.calls[0]!;
    expect(url).toMatch(/\/invitations\/me\/guide$/);
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(init.cache).toBe("no-store");
    expect(init.next).toBeUndefined();
  });

  it.each([401, 403, 404])("is empty on %i", async (status) => {
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

describe("getGuide after a good answer (last known good, QA P0-1)", () => {
  function sequence(...answers: (number | "down")[]) {
    const fn = vi.fn();
    for (const answer of answers) {
      if (answer === "down") fn.mockRejectedValueOnce(new TypeError("fetch failed"));
      else fn.mockResolvedValueOnce({ ok: answer < 300, status: answer, json: async () => guide });
    }
    vi.stubGlobal("fetch", fn);
  }

  it.each(["down", 500, 503] as const)("serves the last good guide when the API is %s", async (outage) => {
    sequence(200, outage);
    await getGuide("tok");
    expect(await getGuide("tok")).toEqual({ status: "ok", data: guide });
  });

  it.each([401, 403, 404, 410])("drops it for good once the API answers %i", async (status) => {
    sequence(200, status, "down");
    await getGuide("tok");
    expect((await getGuide("tok")).status).not.toBe("ok");
    expect(await getGuide("tok")).toMatchObject({ status: "error", kind: "network" });
  });

  it("drops it when getInvitation is refused for the same token", async () => {
    sequence(200, 404, "down");
    await getGuide("tok");
    expect(await getInvitation("tok")).toEqual({ status: "empty" });
    expect(await getGuide("tok")).toMatchObject({ status: "error", kind: "network" });
  });

  it("forgetGuide drops only that token's copy", async () => {
    sequence(200, 200, "down", "down");
    await getGuide("tok");
    await getGuide("other");
    forgetGuide(await hashToken("tok"));
    expect(await getGuide("tok")).toMatchObject({ status: "error", kind: "network" });
    expect(await getGuide("other")).toEqual({ status: "ok", data: guide });
  });
});
