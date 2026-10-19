import { renderToStaticMarkup as html } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const event = vi.fn();
const gallery = vi.fn();
const wishes = vi.fn();
vi.mock("../lib/api/event", () => ({ getEvent: () => event() }));
vi.mock("../lib/api/gallery", () => ({ getGallery: () => gallery() }));
vi.mock("../lib/api/wishes", () => ({ getWishes: () => wishes() }));

import Home from "./page";

const error = { status: "error", kind: "network", message: "x" };
const okEvent = {
  status: "ok",
  data: {
    name: "GRAD '26",
    startsAt: "2026-11-20T02:00:00.000Z",
    endsAt: null,
    timeZone: "Asia/Ho_Chi_Minh",
    timeConfirmed: true,
    venue: { name: "Ceremony Hall", address: "VGU Campus, Binh Duong", mapUrl: "https://maps.example/x" },
    arrivalInfo: null,
    contact: null,
  },
};

async function render() {
  return html(await Home());
}

const main = (out: string) => out.split('<main id="main"')[1]?.split("</main>")[0] ?? "";
const entries = (out: string) => [...main(out).matchAll(/<a class="home-entry" href="([^"]+)">.*?home-entry__title">([^<]+)<\/span><span class="home-entry__description">([^<]+)</g)].map((m) => [m[1], m[2], m[3]]);

describe("/", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    event.mockResolvedValue(okEvent);
  });

  it("says what the site is for in one headline and one sentence", async () => {
    const out = await render();
    expect(out.match(/<h1/g)).toHaveLength(1);
    expect(out).toContain('aria-label="Graduation ’26"');
    expect(main(out)).toContain("Your invitation, the way to the venue, and a shared camera for the VGU Class of 2026 graduation.");
  });

  it("offers four entry points, invitation and venue first", async () => {
    const out = await render();
    expect(entries(out)).toEqual([
      ["/me", "My invitation", "Reply, and keep your pass for the day."],
      ["/venue", "Venue and calendar", "Friday 20 November · Ceremony Hall"],
      ["/gallery", "Open camera", "Take photos for the shared gallery."],
      ["/wishes", "Wishes", "Leave a few words for the graduates."],
    ]);
  });

  it("keeps the entry points when the API is down", async () => {
    event.mockResolvedValue(error);
    const out = await render();
    expect(entries(out)).toHaveLength(4);
    expect(main(out)).toContain("Date, directions and the campus map.");
  });

  it("leaves the facts and teasers to the menubar and their own pages", async () => {
    const out = main(await render());
    // No address, calendar options, countdown, photo or wish teasers on the landing.
    expect(out).not.toContain("VGU Campus, Binh Duong");
    expect(out).not.toContain("webcal");
    expect(out).not.toContain('role="timer"');
    expect(out).not.toContain("<img");
    expect(gallery).not.toHaveBeenCalled();
    expect(wishes).not.toHaveBeenCalled();
  });

  it("renders in Vietnamese", async () => {
    vi.resetModules();
    vi.doMock("next/headers", () => ({
      cookies: async () => ({ get: (name: string) => (name === "lang" ? { name, value: "vi" } : undefined) }),
      headers: async () => new Headers(),
    }));
    const { default: VietnameseHome } = await import("./page");
    const out = html(await VietnameseHome());
    expect(main(out)).toContain("Thư mời của Quý khách");
    expect(main(out)).toContain("Mở máy ảnh");
    expect(main(out)).toMatch(/Thứ Sáu, 20 tháng 11 · Ceremony Hall/);
    vi.doUnmock("next/headers");
  });
});
