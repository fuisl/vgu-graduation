import {renderToStaticMarkup as html} from "react-dom/server";
import {describe, expect, it} from "vitest";
import GalleryPage from "./gallery/page";
import PolaroidPage from "./polaroid/page";
import WishesPage from "./wishes/page";

describe("memories pages", () => {
  it("gallery and wishes mark themselves current and link to the camera", () => {
    for (const Page of [GalleryPage, WishesPage]) {
      const out = html(<Page />);
      expect(out).toContain('data-theme="brand"');
      expect(out.match(/aria-current="page"/g)).toHaveLength(2);
      expect(out).toContain('href="/polaroid"');
    }
  });

  it("polaroid is not a nav item and keeps the camera form", () => {
    const out = html(<PolaroidPage />);
    expect(out).not.toContain("aria-current");
    expect(out).toContain('aria-label="Take photo"');
    expect(out).toContain("Shots remaining unknown until your first photo");
  });

  it("wishes renders the form with a disabled submit until there is a message", () => {
    const out = html(<WishesPage />);
    expect(out).toContain('id="wish-message"');
    expect(out).toMatch(/<button class="brand-cta brand-cta--on-white" type="submit" disabled/);
  });
});
