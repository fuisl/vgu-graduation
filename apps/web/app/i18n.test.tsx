import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// A guest who chose Vietnamese (#9): the `lang` cookie is "vi", whatever the browser says.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "lang" ? { name, value: "vi" } : undefined) }),
  headers: async () => new Headers({ "accept-language": "en-GB,en;q=0.9" }),
}));
vi.mock("../lib/api/event", () => ({ getEvent: async () => ({ status: "error", kind: "network", message: "down" }) }));
// The root layout's fonts are a Next build feature.
vi.mock("geist/font/mono", () => ({ GeistMono: { variable: "mono" } }));
vi.mock("geist/font/sans", () => ({ GeistSans: { variable: "sans" } }));
vi.mock("next/font/google", () => ({ Inter_Tight: () => ({ variable: "inter" }) }));

const { getLocale } = await import("../lib/i18n/server");
const { default: WishesPage } = await import("./(memories)/wishes/page");
const { default: VenuePage } = await import("./venue/page");
const { default: RootLayout } = await import("./layout");

describe("pages in Vietnamese", () => {
  it("resolves the cookie over Accept-Language", async () => {
    expect(await getLocale()).toBe("vi");
  });

  it("sets <html lang>", async () => {
    expect(html(await RootLayout({ children: null }))).toMatch(/<html[^>]* lang="vi"/);
  });

  it("renders header, page and footer copy in Vietnamese, with VI marked current", async () => {
    const out = html(await WishesPage());
    expect(out).toContain("Lưu lại một kỷ niệm.");
    expect(out).toContain(">Lời chúc<");
    expect(out).toContain("Cổng khách mời");
    expect(out).toContain("Lễ tốt nghiệp VGU · Khóa 2026");
    expect(out).toMatch(/<button[^>]*value="vi"[^>]*lang="vi"[^>]*aria-label="VI, Tiếng Việt"[^>]*aria-current="true"/);
    expect(out).not.toMatch(/value="en"[^>]*aria-current/);
    expect(out).not.toContain("Leave a memory.");
  });

  it("shows the Vietnamese error state when the API is down", async () => {
    const out = html(await VenuePage());
    expect(out).toContain("Thông tin sự kiện tạm thời chưa hiển thị được.");
    expect(out).toContain(">Thử lại<");
  });
});
