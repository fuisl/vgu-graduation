"use client";

import { useEffect } from "react";
import { BRAND_THEME_COLOR } from "./theme-color";

const TRANSPARENT = /^(transparent|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\))$/i;

/** Background colour of the first opaque element at the top edge of the viewport. */
function colorAtTopEdge(): string | null {
  const x = Math.round(window.innerWidth / 2);
  for (const element of document.elementsFromPoint(x, 1)) {
    const color = getComputedStyle(element).backgroundColor;
    if (color && !TRANSPARENT.test(color)) return color;
  }
  return null;
}

/**
 * Keeps the browser's own UI tinted like the section under it, as the page scrolls
 * between blue and white bands (#142).
 * - `<meta name="theme-color">`: Chrome on Android and Safari 15–18.
 * - `body.style.backgroundColor` (inline): Safari 26 ignores theme-color and tints
 *   from the page, re-reading the body colour only when its inline style changes.
 * Updates once per animation frame at most, and only when the colour changes. The
 * body colour and meta are reset on unmount, so non-brand pages (admin) keep their own.
 */
export function ThemeColorSync() {
  useEffect(() => {
    const existing = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const meta = existing ?? Object.assign(document.createElement("meta"), { name: "theme-color" });
    if (!existing) document.head.append(meta);

    const previousBody = document.body.style.backgroundColor;
    let current = "";
    let frame: number | undefined;

    const sync = () => {
      frame = undefined;
      const color = colorAtTopEdge() ?? BRAND_THEME_COLOR;
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
