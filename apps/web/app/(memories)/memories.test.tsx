import {renderToStaticMarkup as html} from "react-dom/server";
import {describe, expect, it} from "vitest";
import GalleryPage from "./gallery/page";
import PolaroidPage from "./polaroid/page";
import WishesPage from "./wishes/page";

describe("memories pages", () => {
  it("gallery and wishes mark themselves current and link to the camera", async () => {
    for (const Page of [GalleryPage, WishesPage]) {
      const out = html(await Page());
      expect(out).toContain('data-theme="brand"');
      expect(out.match(/aria-current="page"/g)).toHaveLength(2);
      expect(out).toContain('href="/polaroid"');
    }
  });

  it("gallery links to the curated archive", async () => {
    expect(html(await GalleryPage())).toContain('href="/memories"');
  });

  it("polaroid is not a nav item and keeps the camera form", async () => {
    const out = html(await PolaroidPage());
    expect(out).not.toContain('aria-current="page"');
    expect(out).toContain('aria-label="Take photo"');
    expect(out).toContain("Shots remaining unknown until your first photo");
  });

  it("wishes renders the form with a disabled submit until there is a message", async () => {
    const out = html(await WishesPage());
    expect(out).toContain('id="wish-message"');
    expect(out).toMatch(/<button class="brand-cta brand-cta--on-white" type="submit" disabled/);
  });
});
