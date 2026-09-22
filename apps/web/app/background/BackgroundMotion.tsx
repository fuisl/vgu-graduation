"use client";

import { useEffect } from "react";

// Sets CSS custom properties on the document root rather than owning any DOM of its own,
// so the background layers (aurora, grid) can react to scroll and pointer position purely
// through CSS — no re-render on every scroll/mousemove tick.
export function BackgroundMotion() {
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;

    const root = document.documentElement;
    let scrollFrame = 0;
    const updateScroll = () => {
      scrollFrame = 0;
      root.style.setProperty("--scroll-y", `${window.scrollY}px`);
    };
    const onScroll = () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(updateScroll);
    };
    updateScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    // Cursor parallax only where a precise pointer is actually driving the cursor.
    const pointerQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    let pointerFrame = 0;
    let pendingX = 0;
    let pendingY = 0;
    const applyPointer = () => {
      pointerFrame = 0;
      root.style.setProperty("--pointer-x", pendingX.toFixed(3));
      root.style.setProperty("--pointer-y", pendingY.toFixed(3));
    };
    const onPointerMove = (event: PointerEvent) => {
      pendingX = (event.clientX / window.innerWidth) * 2 - 1;
      pendingY = (event.clientY / window.innerHeight) * 2 - 1;
      if (!pointerFrame) pointerFrame = requestAnimationFrame(applyPointer);
    };
    if (pointerQuery.matches) window.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointerMove);
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      if (pointerFrame) cancelAnimationFrame(pointerFrame);
      root.style.removeProperty("--scroll-y");
      root.style.removeProperty("--pointer-x");
      root.style.removeProperty("--pointer-y");
    };
  }, []);

  return null;
}
