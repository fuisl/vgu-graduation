import {renderToStaticMarkup as html} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

const event = vi.fn();
vi.mock("../../lib/api/event", () => ({getEvent: () => event()}));

import {EventEssentials} from "./EventEssentials";
import {SiteFooter} from "./SiteFooter";
import {SiteHeader} from "./SiteHeader";
import {nextTrapIndex} from "./nav";
import {createI18n} from "../../lib/i18n/dictionary";

const i18n = createI18n("en");
const vi18n = createI18n("vi");

const okEvent = {
  status: "ok",
  data: {
    name: "GRAD '26",
    startsAt: "2026-11-20T02:00:00.000Z",
    endsAt: null,
    timeZone: "Asia/Ho_Chi_Minh",
    timeConfirmed: true,
    venue: {name: "Ceremony Hall", address: "VGU Campus", mapUrl: "https://maps.example/x"},
    arrivalInfo: null,
    contact: null,
  },
};

const desktop = (markup: string) => markup.split('class="brand-header__action"')[0];
const action = (markup: string) => markup.split('class="brand-header__action"')[1]?.split('class="brand-header__mobile"')[0] ?? "";
const sheet = (markup: string) => markup.split('class="brand-sheet"')[1] ?? "";

beforeEach(() => {
  vi.resetAllMocks();
  event.mockResolvedValue({status: "error", kind: "network", message: "x"});
});

describe("SiteHeader (the menubar)", () => {
  it("leads the nav with the event essentials, then Camera and Wishes", () => {
    const links = [...desktop(html(<SiteHeader i18n={i18n} />)).matchAll(/<a class="brand-pill" href="([^"]+)"[^>]*>(.*?)<\/a>/g)].map((m) => [m[1], m[2]]);
    // Server render before GET /event answers (and when it fails): a plain "Venue" label.
    expect(links).toEqual([["/venue", "Venue"], ["/gallery", "Camera"], ["/wishes", "Wishes"]]);
  });

  it("marks the current item with aria-current in the desktop nav", () => {
    const out = desktop(html(<SiteHeader i18n={i18n} current="gallery" />));
    expect(out.match(/aria-current="page"/g)).toHaveLength(1);
    expect(out).toMatch(/aria-current="page"[^>]*>Camera</);
    expect(desktop(html(<SiteHeader i18n={i18n} current="venue" />))).toMatch(/href="\/venue" aria-current="page"/);
  });

  it("has no current item on home: the mark is the way home", () => {
    const out = html(<SiteHeader i18n={i18n} current="home" />);
    expect(out).not.toContain('aria-current="page"');
    // Header and sheet: the mark is named "Home" (its image is decorative).
    expect(out.match(/<a class="brand-wordmark"[^>]*aria-label="Home"/g)).toHaveLength(2);
    expect(out).toMatch(/<img[^>]*alt=""[^>]*logo-compact-on-blue\.png|<img[^>]*logo-compact-on-blue\.png[^>]*alt=""/);
  });

  it("shows only the compact logo, also inside the mobile sheet", () => {
    const out = html(<SiteHeader i18n={i18n} />);
    expect(out).toContain("/brand/logo-compact-on-blue.png");
    expect(out).not.toContain("logo-full");
    expect(out.match(/<img[^>]*logo-compact-on-blue\.png/g)).toHaveLength(2);
  });

  it("holds language, text size and the guest's own entry in the desktop action row", () => {
    const out = action(html(<SiteHeader i18n={i18n} />));
    expect(out).toContain('aria-label="Language"');
    expect(out).toMatch(/role="group" aria-label="Text size"/);
    for (const name of ["Default", "Large", "Largest"]) expect(out).toMatch(new RegExp(`aria-label="${name}"[^>]*aria-pressed="false"`));
    expect(out).toContain('href="/me"');
    expect(out).toContain("My invitation");
  });

  it("server-renders the guest chip signed out until /api/me answers", () => {
    const out = html(<SiteHeader i18n={i18n} />);
    expect(out).not.toContain("brand-guest-chip");
    expect(out.match(/My invitation/g)).toHaveLength(2);
  });

  it("renders a custom action instead of the default", () => {
    const out = html(<SiteHeader i18n={i18n} action={<span>Linh</span>} />);
    expect(out).toContain("<span>Linh</span>");
    expect(out).not.toContain("My invitation");
  });

  it("keeps the camera one tap away on mobile, beside Menu", () => {
    const mobile = html(<SiteHeader i18n={i18n} />).split('class="brand-header__mobile"')[1] ?? "";
    expect(mobile.indexOf('href="/gallery"')).toBeLessThan(mobile.indexOf("aria-controls"));
    expect(mobile).toMatch(/<a class="brand-menu-button brand-menu-button--text" href="\/gallery">Camera<\/a>/);
  });

  it("renders the mobile menu button as a labelled three-bars icon", () => {
    const button = html(<SiteHeader i18n={i18n} />).match(/<button[^>]*aria-controls[^>]*>.*?<\/button>/)?.[0] ?? "";
    expect(button).toContain('aria-label="Menu"');
    expect(button).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(button).not.toMatch(/>Menu</);
  });

  it("renders the sheet's close button as a labelled x icon", () => {
    const button = html(<SiteHeader i18n={i18n} />).match(/<button[^>]*aria-label="Close menu"[^>]*>.*?<\/button>/)?.[0] ?? "";
    expect(button).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(button).not.toMatch(/>Close</);
  });

  it("wires the mobile menu button to the hidden sheet", () => {
    const out = html(<SiteHeader i18n={i18n} current="home" />);
    const id = out.match(/aria-controls="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain(`id="${id}"`);
    expect(out).toMatch(/class="brand-sheet"[^>]*hidden/);
  });

  it("puts the essentials, the rows, the chip and both settings in the sheet", () => {
    const out = sheet(html(<SiteHeader i18n={i18n} current="wishes" />));
    expect(out).toMatch(/<a class="brand-sheet__when" href="\/venue">.*Venue and calendar/);
    const rows = [...out.matchAll(/<a class="brand-sheet__link" href="([^"]+)"[^>]*>([^<]+)</g)].map((m) => [m[1], m[2]]);
    expect(rows).toEqual([["/gallery", "Camera"], ["/wishes", "Wishes"]]);
    expect(out).toMatch(/href="\/wishes" aria-current="page"/);
    expect(out).toContain('href="/me"');
    expect(out).toContain('aria-label="Language"');
    expect(out).toContain('aria-label="Text size"');
    // Visible labels for the settings, hidden from assistive tech (the groups carry the names).
    expect(out).toMatch(/<span class="brand-sheet__setting-label" aria-hidden="true">Text size<\/span>/);
  });

  it("never links the footer-only pages", () => {
    const out = html(<SiteHeader i18n={i18n} />);
    for (const href of ["/memories", "/about", "/accessibility"]) expect(out).not.toContain(`href="${href}"`);
  });
});

describe("EventEssentials", () => {
  it("shows the short date and venue in the pill, with where it leads for screen readers", async () => {
    event.mockResolvedValue(okEvent);
    const out = html(await EventEssentials({i18n, variant: "pill"}));
    expect(out).toContain('<time dateTime="2026-11-20T02:00:00.000Z">20 Nov</time>');
    expect(out).toContain('<span class="brand-when__place">Ceremony Hall</span>');
    expect(out).toContain('<span class="brand-sr-only">, venue and calendar</span>');
  });

  it("shows the full date, time and venue in the sheet", async () => {
    event.mockResolvedValue(okEvent);
    const out = html(await EventEssentials({i18n, variant: "sheet"}));
    expect(out).toContain("When and where");
    expect(out).toContain("Friday 20 November");
    expect(out).toContain("09:00 · Ceremony Hall");
  });

  it("formats in the page's language", async () => {
    event.mockResolvedValue(okEvent);
    const out = html(await EventEssentials({i18n: vi18n, variant: "sheet"}));
    expect(out).toContain("Thời gian và địa điểm");
    expect(out).toMatch(/Thứ Sáu, 20 tháng 11/);
  });

  it("degrades to a plain venue label when the API fails or throws", async () => {
    expect(html(await EventEssentials({i18n, variant: "pill"}))).toBe("Venue");
    event.mockRejectedValue(new Error("down"));
    expect(html(await EventEssentials({i18n, variant: "sheet"}))).toBe('<span class="brand-sheet__when-main">Venue and calendar</span>');
  });
});

describe("SiteFooter", () => {
  it("renders landmark, wordmark and credit line", () => {
    const out = html(<SiteFooter i18n={i18n} />);
    expect(out).toContain("<footer");
    expect(out).toContain("/brand/logo-full-on-blue.png");
    expect(out).toContain("brand-section--blue-deep");
    expect(out).toContain('aria-label="Footer"');
    expect(out).toContain("VGU graduation · Class of 2026");
  });

  it("does not repeat the menubar: only the archive, accessibility and credits", () => {
    const out = html(<SiteFooter i18n={i18n} />);
    const links = [...out.matchAll(/<li><a href="([^"]+)">([^<]+)<\/a><\/li>/g)].map((m) => [m[1], m[2]]);
    expect(links).toEqual([["/memories", "Memories"], ["/accessibility", "Accessibility"], ["/about", "Credits"]]);
    for (const href of ["/venue", "/gallery", "/wishes"]) expect(out).not.toContain(`href="${href}"`);
  });

  it("keeps the language switch, the one that works without JavaScript on a phone", () => {
    expect(html(<SiteFooter i18n={i18n} />)).toContain('action="/api/locale"');
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
