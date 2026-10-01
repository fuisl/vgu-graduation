"use client";

import { useEffect } from "react";
import { BRAND_THEME_COLOR } from "./theme-color";

const TRANSPARENT = /^(transparent|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\))$/i;

/** Header elements that each pick on-blue or on-white from what sits behind them. */
const ADAPTIVE = ".brand-wordmark, .brand-header__nav, .brand-header__action, .brand-header > .brand-header__inner .brand-menu-button";

/**
 * Background colour of the first opaque element at (x, y), skipping the sticky header's own
 * elements (they float over the page). The open mobile sheet is part of the header but opaque.
 */
function colorAt(header: HTMLElement | null, x: number, y: number): string | null {
  for (const element of document.elementsFromPoint(x, y)) {
    if (header?.contains(element) && !element.closest(".brand-sheet")) continue;
    const color = getComputedStyle(element).backgroundColor;
    if (color && !TRANSPARENT.test(color)) return color;
  }
  return null;
}

/** True for light colours (white, soft blue), which need the on-white treatment. */
export function isLight(color: string): boolean {
  const [r, g, b] = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  if ([r, g, b].some((v) => v === undefined || Number.isNaN(v))) return false;
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) > 0.5;
}

/**
 * Keeps the sticky site header and the browser's own UI matched to what scrolls under them,
 * as the page moves between blue and white bands (#142).
 * - Logo, nav, action and mobile Menu button: each samples behind its own centre and gets
 *   `data-surface="white"` over a light background, so they adapt independently.
 * - `<meta name="theme-color">`: Chrome on Android and Safari 15–18.
 * - `body.style.backgroundColor` (inline): Safari 26 ignores theme-color and tints
 *   from the page, re-reading the body colour only when its inline style changes.
 * Updates once per animation frame at most. The body colour and meta are reset on unmount,
 * so non-brand pages (admin) keep their own.
 */
export function ThemeColorSync() {
  useEffect(() => {
    const existing = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const meta = existing ?? Object.assign(document.createElement("meta"), { name: "theme-color" });
    if (!existing) document.head.append(meta);

    const previousBody = document.body.style.backgroundColor;
    let current = "";
    let frame: number | undefined;

    const header = document.querySelector<HTMLElement>(".brand-header");
    const targets = header ? Array.from(header.querySelectorAll<HTMLElement>(ADAPTIVE)) : [];

    const sync = () => {
      frame = undefined;
      for (const target of targets) {
        const box = target.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue; // hidden at this breakpoint
        const behind = colorAt(header, box.left + box.width / 2, box.top + box.height / 2);
        if (behind && isLight(behind)) target.dataset.surface = "white";
        else delete target.dataset.surface;
      }

      const color = colorAt(header, Math.round(window.innerWidth / 2), 1) ?? BRAND_THEME_COLOR;
      if (color === current) return;
      current = color;
      meta.content = color;
      document.body.style.backgroundColor = color;
    };
    const schedule = () => {
      if (frame === undefined) frame = window.requestAnimationFrame(sync);
    };

    sync();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // Dialogs and the mobile menu sheet change what sits at the top edge without scrolling.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "open", "hidden"] });

    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
      document.body.style.backgroundColor = previousBody;
      if (existing) meta.content = BRAND_THEME_COLOR;
      else meta.remove();
    };
  }, []);

  return null;
}
