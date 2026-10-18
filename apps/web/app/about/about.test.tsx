import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NOISE, REVEAL_MS, revealFrame, revealTimings } from "./decode";
import AboutPage from "./page";
import { PORTRAIT_COLS, PORTRAIT_ROWS, PORTRAITS } from "./portraits.generated";
import { TEAM } from "./team";

const ART = "  .:@\n#%  \n\n @";
const fixed = () => 0.5;

describe("portrait reveal frames", () => {
  const timings = revealTimings(ART, REVEAL_MS, fixed);

  it("starts blank but keeps the grid shape", () => {
    const first = revealFrame(ART, 0, timings, fixed);
    expect(first.split("\n").map((row) => row.length)).toEqual(ART.split("\n").map((row) => row.length));
    expect(first.split("\n")[0]).toMatch(/^ {2}[^ ]{3}$/); // the first row is already printing
    expect(first.split("\n")[1].trim()).toBe(""); // later rows are still blank
  });

  it("only ever shows noise glyphs before settling, and never on spaces", () => {
    for (let t = 0; t < REVEAL_MS; t += 37) {
      const frame = revealFrame(ART, t, timings, Math.random);
      for (let i = 0; i < ART.length; i += 1) {
        if (ART[i] === " " || ART[i] === "\n") expect(frame[i]).toBe(ART[i]);
        else expect(frame[i] === " " || frame[i] === ART[i] || NOISE.includes(frame[i])).toBe(true);
      }
    }
  });

  it("ends on the exact portrait", () => {
    expect(revealFrame(ART, REVEAL_MS, timings, Math.random)).toBe(ART);
    expect(Math.max(...timings.settle)).toBeLessThanOrEqual(REVEAL_MS);
  });
});

describe("generated portraits", () => {
  it("has one portrait per developer that fits the grid", () => {
    for (const dev of TEAM) {
      const rows = PORTRAITS[dev.handle].split("\n");
      expect(rows).toHaveLength(PORTRAIT_ROWS);
      for (const row of rows) {
        expect(row.length).toBeLessThanOrEqual(PORTRAIT_COLS);
        expect(row).toMatch(/^[ .:\-=+*#%@]*$/);
      }
    }
  });
});

describe("AboutPage", () => {
  const out = html(<AboutPage />);

  it("credits every developer by GitHub handle and role", () => {
    for (const dev of TEAM) {
      expect(out).toContain(`href="https://github.com/${dev.handle}"`);
      expect(out).toContain(`@${dev.handle}`);
      expect(out).toContain(dev.roles.join(" · "));
    }
  });

  it("server-renders the finished portraits, hidden from assistive technology", () => {
    expect(out.match(/<div class="about-portrait" aria-hidden="true">/g)).toHaveLength(TEAM.length);
    expect(out).toContain("about-portrait__art");
  });

  it("uses the site shell with no current nav item and one primary call to action", () => {
    expect(out).toContain("brand-header");
    expect(out).toContain("<footer");
    expect(out.split('class="brand-header__action"')[0]).not.toContain("aria-current");
    expect(out).toContain("View the source");
  });

  it("opens external links safely", () => {
    for (const match of out.matchAll(/<a[^>]*href="https:\/\/github\.com[^"]*"[^>]*>/g)) {
      expect(match[0]).toContain('rel="noopener noreferrer"');
    }
  });
});
