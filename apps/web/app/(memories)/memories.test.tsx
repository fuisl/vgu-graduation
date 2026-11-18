import {renderToStaticMarkup as html} from "react-dom/server";
import {describe, expect, it} from "vitest";
import GalleryPage from "./gallery/page";
import PolaroidPage from "./polaroid/page";
import WallPage from "./wall/page";
import WishesPage from "./wishes/page";

/** The page's own content, without the site header and footer (which other work owns). */
const mainOf = (out: string) => out.slice(out.indexOf('<main id="main"'), out.indexOf("</main>"));

const wall = async (params: Record<string, string> = {}) => html(await WallPage({searchParams: Promise.resolve(params)}));

function redirectTarget(page: () => never): string {
  try {
    page();
  } catch (error) {
    return String((error as {digest?: string}).digest);
  }
  return "";
}

describe("/wall (ADR-019)", () => {
  it("is a brand page, current in the header, with the title, one lead line and the mode toggle", async () => {
    const out = await wall();
    expect(out).toContain('data-theme="brand"');
    expect(out).toMatch(/href="\/wall" aria-current="page"/);
    expect(out).toContain('<h1 id="wall-title" class="wall-title">The Wall</h1>');
    expect(out).toContain('role="group" aria-label="What to post"');
    expect(out).toMatch(/aria-pressed="true"[^>]*>Write a wish</);
    expect(out).toMatch(/aria-pressed="false"[^>]*>Take a photo</);
  });

  it("opens on the wish composer: labelled fields, a required name and Send disabled until there is a message", async () => {
    const main = mainOf(await wall());
    expect(main).toContain('<label class="brand-sr-only" for="wall-message">Your wish</label>');
    expect(main).toMatch(/<textarea[^>]*id="wall-message"[^>]*aria-describedby="wall-consent"/);
    // Before /api/me answers the visitor counts as without an invitation: the name is required.
    expect(main).toMatch(/<input[^>]*id="wall-name"[^>]*required=""/);
    expect(main).toMatch(/<input[^>]*id="wall-name"[^>]*maxLength="60"/);
    expect(main).toMatch(/<button class="brand-cta brand-cta--on-blue" type="submit" disabled/);
  });

  it("never gates posting behind an invitation", async () => {
    for (const out of [await wall(), await wall({mode: "photo"})]) {
      const main = mainOf(out);
      expect(main).not.toContain("Open your invitation first");
      expect(main).not.toContain('href="/me"');
    }
  });

  it("shows the consent notice at the point of posting, in both modes", async () => {
    for (const out of [await wall(), await wall({mode: "photo"})]) {
      expect(out).toContain('<p id="wall-consent" class="wall-consent">By posting, your photo or message may be shown on the event display and gallery');
      expect(out).toContain("Photos from visitors without an invitation appear after an organizer approves them.");
    }
  });

  it("opens the camera with ?mode=photo, with the photo library one tap away", async () => {
    const out = await wall({mode: "photo"});
    expect(out).toMatch(/aria-pressed="true"[^>]*>Take a photo</);
    expect(out).toContain('aria-label="Take photo"');
    expect(out).toContain('aria-label="Library: choose a photo"');
    expect(out).toContain('capture="environment"');
    expect(out.match(/type="file"/g)).toHaveLength(2);
    expect(out).not.toContain('id="wall-message"');
  });

  it("lists everyone's posts below the composer, loading first, with the filter chips", async () => {
    const out = await wall();
    expect(out.indexOf('id="wall-message"')).toBeLessThan(out.indexOf('id="wall-feed-title"'));
    expect(out).toContain("Loading the wall…");
    expect(out).toContain('role="group" aria-label="Show"');
    expect(out).toMatch(/aria-pressed="true"[^>]*>All</);
  });

  it("picks the filter chip from ?show=", async () => {
    expect(await wall({show: "photos"})).toMatch(/aria-pressed="true"[^>]*>Photos</);
    expect(await wall({show: "wishes"})).toMatch(/aria-pressed="true"[^>]*>Wishes</);
  });
});

describe("old routes redirect to the Wall, so shared links and printed codes keep working", () => {
  it("/wishes, /gallery and /polaroid", () => {
    expect(redirectTarget(WishesPage)).toMatch(/NEXT_REDIRECT;[a-z]+;\/wall\?show=wishes;/);
    expect(redirectTarget(GalleryPage)).toMatch(/NEXT_REDIRECT;[a-z]+;\/wall\?show=photos;/);
    expect(redirectTarget(PolaroidPage)).toMatch(/NEXT_REDIRECT;[a-z]+;\/wall\?mode=photo;/);
  });
});
