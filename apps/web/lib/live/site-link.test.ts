import { describe, expect, it } from "vitest";
import { displayLink, publicSiteOrigin, renderLinkQrSvg } from "./site-link";

describe("publicSiteOrigin", () => {
  it("prefers the configured origin", () => {
    expect(publicSiteOrigin("https://grad.example.test/x", "preview.example.test", "https")).toBe("https://grad.example.test");
  });

  it("falls back to the request host, then the production origin", () => {
    expect(publicSiteOrigin(undefined, "localhost:3000", "http")).toBe("http://localhost:3000");
    expect(publicSiteOrigin("javascript:alert(1)", "preview.example.test", null)).toBe("https://preview.example.test");
    expect(publicSiteOrigin(undefined, null, null)).toBe("https://grad26.fuisloy.dev");
  });
});

describe("displayLink", () => {
  it("drops the scheme", () => {
    expect(displayLink("https://grad26.fuisloy.dev/wishes")).toBe("grad26.fuisloy.dev/wishes");
    expect(displayLink("http://localhost:3000/")).toBe("localhost:3000");
  });
});

describe("renderLinkQrSvg", () => {
  it("renders an SVG", async () => {
    expect(await renderLinkQrSvg("https://grad26.fuisloy.dev/wishes")).toMatch(/^<svg[^>]*viewBox/);
  });
});
