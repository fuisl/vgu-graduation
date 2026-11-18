import { describe, expect, it } from "vitest";
import {
  PUBLIC_PAGES,
  absoluteUrl,
  buildLaunchpad,
  formatPendingCount,
  parsePendingCount,
  photoboothUrl,
  withTimeout,
} from "./launchpad";

const ORIGIN = "https://grad26.fuisloy.dev";

describe("launchpad links", () => {
  it("builds every public page as an absolute URL on the site origin", () => {
    const { pages } = buildLaunchpad(ORIGIN, {});
    expect(pages.map((page) => page.url)).toEqual([
      "https://grad26.fuisloy.dev/",
      "https://grad26.fuisloy.dev/wall",
      "https://grad26.fuisloy.dev/guide",
      "https://grad26.fuisloy.dev/venue",
      "https://grad26.fuisloy.dev/display",
      "https://grad26.fuisloy.dev/live",
      "https://grad26.fuisloy.dev/ascii-live",
      "https://grad26.fuisloy.dev/memories",
      "https://grad26.fuisloy.dev/graduate",
      "https://grad26.fuisloy.dev/docs",
    ]);
  });

  it("works for a preview or LAN origin, and ignores a trailing slash", () => {
    expect(absoluteUrl("http://192.168.1.20:3000/", "/display")).toBe("http://192.168.1.20:3000/display");
    expect(buildLaunchpad("https://preview.example", {}).runbookUrl).toBe("https://preview.example/docs/operations/event-runbook");
  });

  it("gives every page a name, a purpose and a unique root path", () => {
    for (const page of PUBLIC_PAGES) {
      expect(page.name).not.toBe("");
      expect(page.purpose).not.toBe("");
      expect(page.path.startsWith("/")).toBe(true);
    }
    expect(new Set(PUBLIC_PAGES.map((page) => page.path)).size).toBe(PUBLIC_PAGES.length);
    expect(PUBLIC_PAGES.find((page) => page.path === "/display")?.note).toMatch(/kiosk invitation link/);
  });
});

describe("photobooth", () => {
  it("is hidden when PHOTOBOOTH_PUBLIC_URL is unset, blank or not an http(s) URL", () => {
    expect(buildLaunchpad(ORIGIN, {}).photobooth).toBeNull();
    expect(buildLaunchpad(ORIGIN, { PHOTOBOOTH_PUBLIC_URL: "  " }).photobooth).toBeNull();
    expect(photoboothUrl("booth.local")).toBeNull();
    expect(photoboothUrl("javascript:alert(1)")).toBeNull();
  });

  it("links the LAN address with its note when set", () => {
    const { photobooth } = buildLaunchpad(ORIGIN, { PHOTOBOOTH_PUBLIC_URL: " http://192.168.1.50:8080 " });
    expect(photobooth).toEqual({ url: "http://192.168.1.50:8080/", note: expect.stringMatching(/^LAN only/) });
  });
});

describe("live status helpers", () => {
  it("counts photos awaiting approval, and hides the line on any failure", () => {
    expect(parsePendingCount(200, { pending: 2 })).toEqual({ count: 2, more: false });
    expect(parsePendingCount(404, { error: "Not Found", message: "x" })).toBeNull();
    expect(parsePendingCount(200, null)).toBeNull();
    expect(parsePendingCount(200, { pending: "x" })).toBeNull();
    expect(formatPendingCount({ count: 3, more: false })).toBe("3");
    expect(formatPendingCount({ count: 100, more: true })).toBe("100+");
  });

  it("falls back when a call is slow or fails", async () => {
    expect(await withTimeout(Promise.resolve("ok"), 50, "late")).toBe("ok");
    expect(await withTimeout(new Promise<string>(() => {}), 5, "late")).toBe("late");
    expect(await withTimeout(Promise.reject(new Error("down")), 50, "failed")).toBe("failed");
  });
});
