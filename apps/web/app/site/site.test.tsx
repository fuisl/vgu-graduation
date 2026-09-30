import {renderToStaticMarkup as html} from "react-dom/server";
import {describe, expect, it} from "vitest";
import {SiteFooter} from "./SiteFooter";
import {SiteHeader} from "./SiteHeader";
import {nextTrapIndex} from "./nav";

const desktop = (markup: string) => markup.split('class="brand-header__action"')[0];

describe("SiteHeader", () => {
  it("marks the current item with aria-current in the desktop nav", () => {
    const out = desktop(html(<SiteHeader current="venue" />));
    expect(out.match(/aria-current="page"/g)).toHaveLength(1);
    expect(out).toMatch(/aria-current="page"[^>]*>Venue</);
  });

  it("shows only the compact logo, also inside the mobile sheet", () => {
    const out = html(<SiteHeader />);
    expect(out).toContain("/brand/logo-compact-on-blue.png");
    expect(out).not.toContain("logo-full");
    expect(out.match(/<img[^>]*logo-compact-on-blue\.png/g)).toHaveLength(2);
  });

  it("has no current item by default", () => {
    expect(html(<SiteHeader />)).not.toContain("aria-current");
  });

  it("renders the four links in order", () => {
    const links = [...desktop(html(<SiteHeader />)).matchAll(/<a class="brand-pill" href="([^"]+)"[^>]*>([^<]+)</g)].map((m) => [m[1], m[2]]);
    expect(links).toEqual([["/", "Home"], ["/venue", "Venue"], ["/gallery", "Gallery"], ["/wishes", "Wishes"]]);
  });

  it("defaults the action to the signed-out chip linking to /invite", () => {
    const out = html(<SiteHeader />);
    expect(out).toContain('href="/invite"');
    expect(out).toContain("Your invitation");
  });

  it("server-renders the guest chip signed out until /api/me answers", () => {
    const out = html(<SiteHeader />);
    expect(out).not.toContain("brand-guest-chip");
    expect(out.match(/Your invitation/g)).toHaveLength(2);
  });

  it("renders a custom action instead of the default", () => {
    const out = html(<SiteHeader action={<span>Linh</span>} />);
    expect(out).toContain("<span>Linh</span>");
    expect(out).not.toContain("Your invitation");
  });

  it("wires the mobile menu button to the hidden sheet", () => {
    const out = html(<SiteHeader current="home" />);
    const id = out.match(/aria-controls="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain(`id="${id}"`);
    expect(out).toMatch(/class="brand-sheet"[^>]*hidden/);
  });
});

describe("SiteFooter", () => {
  it("renders landmark, links and credit", () => {
    const out = html(<SiteFooter />);
    expect(out).toContain("<footer");
    expect(out).toContain("/brand/logo-full-on-blue.png");
    expect(out).toContain("brand-section--blue-deep");
    expect(out).toContain('aria-label="Footer"');
    expect(out).toContain("VGU graduation · Class of 2026");
  });
});

describe("nextTrapIndex", () => {
  it("wraps forwards and backwards", () => {
    expect(nextTrapIndex(3, 2, false)).toBe(0);
    expect(nextTrapIndex(3, 0, true)).toBe(2);
    expect(nextTrapIndex(3, 1, false)).toBe(2);
  });
  it("enters the trap from outside and handles empty", () => {
    expect(nextTrapIndex(3, -1, false)).toBe(0);
    expect(nextTrapIndex(3, -1, true)).toBe(2);
    expect(nextTrapIndex(0, -1, false)).toBe(-1);
  });
});
