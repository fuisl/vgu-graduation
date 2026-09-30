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
    startsAt: "2026-11-14T02:00:00.000Z",
    endsAt: null,
    timeZone: "Asia/Ho_Chi_Minh",
    timeConfirmed: true,
    venue: { name: "VGU Campus", address: "Binh Duong", mapUrl: "https://maps.example/x" },
    arrivalInfo: null,
    contact: null,
  },
};

async function render() {
  return html(await Home());
}

describe("/", () => {
  beforeEach(() => vi.resetAllMocks());

  it("degrades every data section when the API is down", async () => {
    event.mockResolvedValue(error);
    gallery.mockResolvedValue(error);
    wishes.mockResolvedValue(error);
    const out = await render();
    expect(out).toContain("Event details are temporarily unavailable");
    expect(out).toContain("Photos are temporarily unavailable");
    expect(out).toContain("Wishes are temporarily unavailable");
    expect(out.match(/<h1/g)).toHaveLength(1);
    expect(out).toContain('href="/invite"');
  });

  it("shows event, empty gallery and populated wishes", async () => {
    event.mockResolvedValue(okEvent);
    gallery.mockResolvedValue({ status: "ok", data: { items: [], nextCursor: null } });
    wishes.mockResolvedValue({
      status: "ok",
      data: { items: [{ id: "1", authorName: "Jane", body: "Congrats!", createdAt: "2026-11-01T00:00:00.000Z" }], nextCursor: null },
    });
    const out = await render();
    expect(out).toContain("VGU Campus");
    expect(out).toContain("webcal");
    expect(out).toContain("First photos appear on ceremony day.");
    expect(out).toContain("Congrats!");
    expect(out).toContain("Jane");
  });

  it("renders at most six square thumbnails", async () => {
    event.mockResolvedValue(okEvent);
    const items = Array.from({ length: 9 }, (_, i) => ({ publicId: `p${i}`, width: 1, height: 1, createdAt: "2026-11-01T00:00:00.000Z" }));
    gallery.mockResolvedValue({ status: "ok", data: { items, nextCursor: null } });
    wishes.mockResolvedValue({ status: "ok", data: { items: [], nextCursor: null } });
    const out = await render();
    expect(out.match(/alt="Guest photo"/g)).toHaveLength(6);
    expect(out).toContain("/thumb");
  });
});
