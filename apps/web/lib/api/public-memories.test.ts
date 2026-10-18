import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicGallery, getPublicWishes, PUBLIC_LISTING_MAX_PAGES } from "./public-memories";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const item = (publicId: string) => ({ publicId, width: 10, height: 10, createdAt: "2026-11-20T02:00:00.000Z" });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("public memories BFF", () => {
  it("follows cursors with the same cache tag on every page", async () => {
    vi.stubEnv("API_ORIGIN", "http://api.example.test");
    const fetch = vi.fn(async (url: string) =>
      url.includes("cursor=") ? json({ items: [item("b")], nextCursor: null }) : json({ items: [item("a")], nextCursor: "c 1" }),
    );
    vi.stubGlobal("fetch", fetch);

    const result = await getPublicGallery();
    expect(result).toEqual({ status: "ok", data: { items: [item("a"), item("b")], truncated: false } });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "http://api.example.test/gallery/public?limit=100",
      "http://api.example.test/gallery/public?limit=100&cursor=c%201",
    ]);
    for (const [, init] of fetch.mock.calls as unknown as [string, { next: { revalidate: number; tags: string[] } }][]) {
      expect(init.next).toEqual({ revalidate: 60, tags: ["gallery-public"] });
    }
  });

  it("stops after the page budget and says so", async () => {
    const fetch = vi.fn(async () => json({ items: [item("x")], nextCursor: "more" }));
    vi.stubGlobal("fetch", fetch);
    const result = await getPublicGallery();
    expect(fetch).toHaveBeenCalledTimes(PUBLIC_LISTING_MAX_PAGES);
    expect(result.status === "ok" && result.data.truncated).toBe(true);
  });

  it("tags wishes with wishes-public on the 30-second cadence", async () => {
    const fetch = vi.fn(async () => json({ items: [], nextCursor: null }));
    vi.stubGlobal("fetch", fetch);
    await getPublicWishes();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, { next: unknown }];
    expect(url).toMatch(/\/wishes\/public\?limit=100$/);
    expect(init.next).toEqual({ revalidate: 30, tags: ["wishes-public"] });
  });

  it("reports network, HTTP and shape errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await getPublicGallery()).toMatchObject({ status: "error", kind: "network" });
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 503)));
    expect(await getPublicGallery()).toMatchObject({ status: "error", kind: "http", httpStatus: 503 });
    vi.stubGlobal("fetch", vi.fn(async () => json({ items: [{ nope: true }], nextCursor: null })));
    expect(await getPublicWishes()).toMatchObject({ status: "error", kind: "validation" });
  });
});
