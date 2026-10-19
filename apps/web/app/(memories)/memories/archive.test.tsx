import { renderToStaticMarkup as html } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MemoriesPage from "./page";
import TimelinePage from "./timeline/page";

type Call = { url: string; init: RequestInit & { next?: { revalidate?: number; tags?: string[] } } };

const photo = (publicId: string, createdAt: string) => ({ publicId, width: 1600, height: 1200, createdAt });
const wish = (id: string, body: string, createdAt: string) => ({ id, authorName: "Lan", body, createdAt });

const EVENT = {
  name: "GRAD '26",
  startsAt: "2026-11-20T02:00:00.000Z", // 09:00 in Ho Chi Minh City
  endsAt: "2026-11-20T04:00:00.000Z",
  timeZone: "Asia/Ho_Chi_Minh",
  timeConfirmed: true,
  venue: { name: "Ceremony Hall", address: "VGU", mapUrl: "https://maps.example/x" },
  contact: null,
  arrivalInfo: null,
};

let calls: Call[];

function stubApi(routes: Record<string, unknown | number>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: Call["init"]) => {
      calls.push({ url, init });
      const path = new URL(url).pathname;
      const route = routes[path];
      if (route === undefined) return new Response("not stubbed", { status: 599 });
      if (typeof route === "number") return new Response("{}", { status: route });
      return new Response(JSON.stringify(route), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
}

const page = <T,>(items: T[]) => ({ items, nextCursor: null });

/** Every API path the page read, once each, sorted. */
const pathsCalled = () => [...new Set(calls.map((call) => new URL(call.url).pathname))].sort();

beforeEach(() => {
  vi.stubEnv("API_ORIGIN", "http://api.internal.test");
  vi.stubEnv("PUBLIC_API_ORIGIN", "https://api.public.test");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("/memories (curated archive, #75)", () => {
  it("calls only the curated public listings, with their cache tags", async () => {
    stubApi({
      "/gallery/public": page([photo("pub-1", "2026-11-20T03:00:00.000Z")]),
      "/wishes/public": page([wish("8a6f3c1e-0a8e-4c51-9d2e-3c1f8d4b2a10", "Congratulations!", "2026-11-20T05:00:00.000Z")]),
    });
    const out = html(await MemoriesPage());

    // The site header may read GET /event for its date and venue; only the listings matter here.
    const paths = pathsCalled().filter((path) => path !== "/event");
    expect(paths).toEqual(["/gallery/public", "/wishes/public"]);
    expect(calls.every((call) => call.url.startsWith("http://api.internal.test/"))).toBe(true);
    const tags = Object.fromEntries(calls.map((call) => [new URL(call.url).pathname, call.init.next?.tags]));
    expect(tags["/gallery/public"]).toEqual(["gallery-public"]);
    expect(tags["/wishes/public"]).toEqual(["wishes-public"]);
    // Never the event-wide listings, which include unflagged items.
    expect(calls.some((call) => /\/(gallery|wishes)\?/.test(call.url))).toBe(false);

    expect(out).toContain("Congratulations!");
    expect(out).toContain('href="/memories/timeline"');
  });

  it("keeps the copy short: a headline and one action, no eyebrows or closing link band", async () => {
    stubApi({ "/gallery/public": page([photo("pub-1", "2026-11-20T03:00:00.000Z")]), "/wishes/public": page([]) });
    const out = html(await MemoriesPage());
    const main = out.slice(out.indexOf('<main id="main">'), out.indexOf("</main>"));
    expect(main).not.toContain("brand-eyebrow");
    expect(main).not.toContain("memories-more-title");
    expect(main.match(/class="brand-cta /g)).toHaveLength(1);
  });

  it("serves derivatives only, with a srcset from thumb to display", async () => {
    stubApi({ "/gallery/public": page([photo("pub-1", "2026-11-20T03:00:00.000Z")]), "/wishes/public": page([]) });
    const out = html(await MemoriesPage());
    expect(out).toContain('src="https://api.public.test/media/pub-1/thumb"');
    expect(out).toContain("https://api.public.test/media/pub-1/thumb 640w, https://api.public.test/media/pub-1/display 1600w");
    expect(out).toContain('href="https://api.public.test/media/pub-1/display"');
    expect(out).not.toMatch(/original/i);
    expect(out).toContain('width="640" height="480"');
  });

  it("shows one friendly empty state before anything is curated", async () => {
    stubApi({ "/gallery/public": page([]), "/wishes/public": page([]) });
    const out = html(await MemoriesPage());
    expect(out).toContain("Nothing curated yet");
    expect(out).toContain('href="/gallery"');
    expect(out).not.toContain("memories-wishes-title");
    expect(out.match(/<h1/g)).toHaveLength(1);
  });

  it("degrades one section when a listing fails", async () => {
    stubApi({ "/gallery/public": 503, "/wishes/public": page([wish("8a6f3c1e-0a8e-4c51-9d2e-3c1f8d4b2a10", "Well done", "2026-11-20T05:00:00.000Z")]) });
    const out = html(await MemoriesPage());
    expect(out).toContain("The archive photos are temporarily unavailable");
    expect(out).toContain("Well done");
  });
});

describe("/memories/timeline (#76)", () => {
  it("calls only the curated listings and the event, and splits the day into chapters", async () => {
    stubApi({
      "/gallery/public": page([photo("late", "2026-11-20T09:00:00.000Z"), photo("hall", "2026-11-20T02:30:00.000Z")]),
      "/wishes/public": page([wish("8a6f3c1e-0a8e-4c51-9d2e-3c1f8d4b2a10", "See you soon", "2026-11-20T01:15:00.000Z")]),
      "/event": EVENT,
    });
    const out = html(await TimelinePage());

    // GET /event may also be read by the site header; count each path once.
    expect(pathsCalled()).toEqual(["/event", "/gallery/public", "/wishes/public"]);
    expect(calls.filter((call) => call.url.includes("/event")).some((call) => call.init.next?.tags?.includes("event"))).toBe(true);

    expect(out).toContain('id="arrival"');
    expect(out).toContain('id="ceremony"');
    expect(out).toContain('id="celebration"');
    expect(out).toContain('href="#ceremony"');
    expect(out).toContain("09:00–11:00");
    // Oldest first: the arrival wish comes before the ceremony photo.
    expect(out.indexOf("See you soon")).toBeLessThan(out.indexOf('src="https://api.public.test/media/hall/thumb"'));
    expect(out).toContain('loading="lazy"');
  });

  it("falls back to hours when the event config is unavailable", async () => {
    stubApi({
      "/gallery/public": page([photo("a", "2026-11-20T02:30:00.000Z"), photo("b", "2026-11-20T05:10:00.000Z")]),
      "/wishes/public": page([]),
      "/event": 503,
    });
    const out = html(await TimelinePage());
    expect(out).toContain('id="hour-09"');
    expect(out).toContain('id="hour-12"');
  });

  it("has an empty state before anything is curated", async () => {
    stubApi({ "/gallery/public": page([]), "/wishes/public": page([]), "/event": EVENT });
    const out = html(await TimelinePage());
    expect(out).toContain("Nothing curated yet");
    expect(out).toContain("The timeline fills in after the ceremony");
    expect(out).not.toContain('aria-label="Chapters"');
  });

  it("shows an error state when both listings fail", async () => {
    stubApi({ "/gallery/public": 500, "/wishes/public": 500, "/event": EVENT });
    const out = html(await TimelinePage());
    expect(out).toContain("The timeline is temporarily unavailable");
  });
});
