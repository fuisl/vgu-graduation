import { readFileSync } from "node:fs";
import { renderToStaticMarkup as html } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { maySculpt } from "./sculpture-gate";
import { SCULPTURE_MOTIF, SculptureFallback } from "./SculptureFallback";

describe("landing sculpture gate (QA P1-4)", () => {
  it("starts WebGL only with motion allowed, no Save-Data and a context", () => {
    expect(maySculpt({ reducedMotion: false, saveData: false, webgl: true })).toBe(true);
    expect(maySculpt({ reducedMotion: true, saveData: false, webgl: true })).toBe(false);
    expect(maySculpt({ reducedMotion: false, saveData: true, webgl: true })).toBe(false);
    expect(maySculpt({ reducedMotion: false, saveData: false, webgl: false })).toBe(false);
  });

  it("server-renders the same motif the canvas shows first, so the swap does not shift", () => {
    const source = readFileSync(new URL("./Sculpture.tsx", import.meta.url), "utf8");
    expect(source).toContain(SCULPTURE_MOTIF);
    const out = html(createElement(SculptureFallback, { label: "Animated ASCII sculpture: Software Engineering" }));
    expect(out).toContain('role="img"');
    expect(out).toContain('aria-label="Animated ASCII sculpture: Software Engineering"');
    expect(out).toContain("sculpture-fallback");
  });

  it("hides the unlabelled loading frame from assistive tech", () => {
    const out = html(createElement(SculptureFallback));
    expect(out).toContain('aria-hidden="true"');
    expect(out).not.toContain('role="img"');
  });
});
