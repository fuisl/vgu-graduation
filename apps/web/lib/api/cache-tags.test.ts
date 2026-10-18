import { CACHE_TAGS } from "@grad/contract";
import { afterEach, describe, expect, it, vi } from "vitest";
import { webTagsToRevalidate, WEB_CACHE_TAGS } from "./cache-tags";
import { getGallery } from "./gallery";
import { getWishes } from "./wishes";

afterEach(() => vi.unstubAllGlobals());

function stubFetch() {
  const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ items: [], nextCursor: null }) });
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("webTagsToRevalidate", () => {
  it("maps every API tag to the web tag its listing is cached under", () => {
    expect(webTagsToRevalidate([CACHE_TAGS.gallery, CACHE_TAGS.publicGallery])).toEqual(["gallery", "gallery-public"]);
    expect(webTagsToRevalidate([CACHE_TAGS.wishes, CACHE_TAGS.publicWishes])).toEqual(["wishes", "wishes-public"]);
    expect(webTagsToRevalidate([CACHE_TAGS.event])).toEqual(["event"]);
  });

  it("drops unknown tags and duplicates, and is empty when nothing changed", () => {
    expect(webTagsToRevalidate(["gallery", "gallery", "invitation:abc", "../admin"])).toEqual(["gallery"]);
    expect(webTagsToRevalidate([])).toEqual([]);
  });
});

describe("listing fetches use the same tags the API names", () => {
  it("GET /gallery is cached under the gallery tag", async () => {
    const spy = stubFetch();
    await getGallery();
    expect(spy.mock.calls[0][1].next.tags).toEqual([WEB_CACHE_TAGS.gallery]);
    expect(webTagsToRevalidate([CACHE_TAGS.gallery])).toEqual(spy.mock.calls[0][1].next.tags);
  });

  it("GET /wishes is cached under the wishes tag", async () => {
    const spy = stubFetch();
    await getWishes();
    expect(spy.mock.calls[0][1].next.tags).toEqual([WEB_CACHE_TAGS.wishes]);
    expect(webTagsToRevalidate([CACHE_TAGS.wishes])).toEqual(spy.mock.calls[0][1].next.tags);
  });
});
