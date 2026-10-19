"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { REVEAL_MS, revealFrame, revealTimings } from "./decode";

const FRAME_MS = 1000 / 30;

/**
 * Prints an ASCII portrait once, the first time it scrolls into view (motion.md, /about).
 * The server renders the finished portrait, so it reads without JavaScript. After hydration the
 * `pre` inside is blanked and decoded when a third of it is on screen, at about 30fps for
 * about a second. Reduced motion, or no IntersectionObserver, keeps the static portrait.
 * A hidden tab pauses requestAnimationFrame, and the next frame after it returns finishes.
 */
export function PortraitReveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pre = ref.current?.querySelector("pre");
    if (!pre) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;

    const target = pre.textContent ?? "";
    const timings = revealTimings(target);
    let frame = 0;
    let start = 0;
    let last = -FRAME_MS;

    pre.textContent = revealFrame(target, 0, timings);

    const tick = (now: number) => {
      if (!start) start = now;
      const elapsed = now - start;
      if (elapsed >= REVEAL_MS) {
        pre.textContent = target;
        return;
      }
      if (now - last >= FRAME_MS) {
        last = now;
        pre.textContent = revealFrame(target, elapsed, timings);
      }
      frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.35 },
    );
    observer.observe(pre);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      pre.textContent = target;
    };
  }, []);

  return <div ref={ref} className="about-portrait__reveal">{children}</div>;
}
