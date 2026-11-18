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

describe("/", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    event.mockResolvedValue(okEvent);
  });

  it("opens with one headline, and no lead while the owner's line is still a placeholder", async () => {
    const out = await render();
    expect(out.match(/<h1/g)).toHaveLength(1);
    expect(out).toContain('aria-label="Graduation ’26"');
    expect(main(out)).not.toContain("home-lead");
    expect(main(out)).not.toContain("[");
  });

  it("shows the-journey/ with the ready chapters, numbered from 01, instead of start-here/", async () => {
    const out = main(await render());
    expect(out).toContain("home-journey");
    expect(out).toContain("the-journey/");
    expect(out).not.toContain("start-here/");
    const files = [...out.matchAll(/class="journey-row__file"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(files).toEqual(["01_presto.jpg", "02_career_fair.jpg", "03_germany.jpg"]);
    expect(out).not.toMatch(/to come/i);
    expect(out.indexOf("home-title")).toBeLessThan(out.indexOf("home-journey"));
  });

  it("keeps the band when the API is down", async () => {
    event.mockResolvedValue(error);
    const out = main(await render());
    expect(out).toContain("the-journey/");
    expect(out).toContain("01_presto.jpg");
  });

  it("leaves the facts and teasers to the menubar and their own pages", async () => {
    const out = main(await render());
    expect(out).not.toContain("VGU Campus, Binh Duong");
    expect(out).not.toContain("webcal");
    expect(out).not.toContain('role="timer"');
    expect(gallery).not.toHaveBeenCalled();
    expect(wishes).not.toHaveBeenCalled();
  });

  it("renders in Vietnamese, with the same heading", async () => {
    vi.resetModules();
    vi.doMock("next/headers", () => ({
      cookies: async () => ({ get: (name: string) => (name === "lang" ? { name, value: "vi" } : undefined) }),
      headers: async () => new Headers(),
    }));
    const { default: VietnameseHome } = await import("./page");
    const out = main(html(await VietnameseHome()));
    expect(out).toContain("the-journey/");
    expect(out).toContain("Ngày hội việc làm");
    expect(out).not.toContain("[");
    vi.doUnmock("next/headers");
  });
});
