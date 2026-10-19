import {renderToStaticMarkup as html} from "react-dom/server";
import {describe, expect, it} from "vitest";
import GalleryPage from "./gallery/page";
import PolaroidPage from "./polaroid/page";
import WishesPage from "./wishes/page";

/** The page's own content, without the site header and footer (which other work owns). */
const mainOf = (out: string) => out.slice(out.indexOf('<main id="main"'), out.indexOf("</main>"));

describe("the Digital Locket (/gallery)", () => {
  it("opens on the camera: a square viewfinder and the shutter, before any copy", async () => {
    const out = html(await GalleryPage());
    expect(out).toContain('data-theme="brand"');
    expect(out).toContain('aria-current="page"');
    expect(out).toContain('aria-label="Camera"');
    expect(out).toContain('aria-label="Take photo"');
    // The shutter waits until /api/me answers, so the permission prompt never comes first for a signed-out visitor.
    expect(out).toMatch(/<button[^>]*class="cam-shutter"[^>]*disabled/);
    // The camera band comes before the feed band.
    expect(out.indexOf("cam-viewfinder")).toBeLessThan(out.indexOf("Everyone&#x27;s photos"));
  });

  it("shows everyone's photos below, loading first", async () => {
    const out = html(await GalleryPage());
    expect(out).toContain('id="feed-photos-title"');
    expect(out).toContain("Loading photos…");
  });

  it("has a visually hidden heading and no hero, eyebrow or duplicated links", async () => {
    const out = html(await GalleryPage());
    expect(out).toMatch(/<h1 id="locket-title" class="brand-sr-only">Digital Locket<\/h1>/);
    const main = mainOf(out);
    expect(main).not.toContain("brand-eyebrow");
    expect(main).not.toContain('href="/polaroid"');
    expect(main).not.toContain('href="/memories"');
    expect(main).not.toContain("Take a disposable photo");
  });

  it("offers the phone camera and the photo library as hidden file inputs", async () => {
    const out = html(await GalleryPage());
    expect(out).toContain('capture="environment"');
    expect(out.match(/type="file"/g)).toHaveLength(2);
  });
});

describe("/polaroid", () => {
  it("redirects to the locket so existing links keep working", () => {
    let digest = "";
    try {
      PolaroidPage();
    } catch (error) {
      digest = String((error as {digest?: string}).digest);
    }
    expect(digest).toContain("NEXT_REDIRECT");
    expect(digest).toContain("/gallery");
  });
});

describe("/wishes", () => {
  it("puts the composer first, named by the page heading, with Send disabled until there is a message", async () => {
    const out = html(await WishesPage());
    expect(out).toContain('aria-current="page"');
    expect(out).toContain('<h1 id="wishes-title" class="wish-title">Leave a wish for the class</h1>');
    expect(out).toMatch(/<textarea[^>]*id="wish-message"[^>]*aria-labelledby="wishes-title"/);
    expect(out).toMatch(/<button class="brand-cta brand-cta--on-blue" type="submit" disabled/);
    expect(mainOf(out)).not.toContain("brand-eyebrow");
    expect(mainOf(out)).not.toContain('href="/polaroid"');
  });

  it("lists everyone's wishes below the composer", async () => {
    const out = html(await WishesPage());
    expect(out.indexOf('id="wish-message"')).toBeLessThan(out.indexOf('id="feed-wishes-title"'));
    expect(out).toContain("Loading wishes…");
  });
});
