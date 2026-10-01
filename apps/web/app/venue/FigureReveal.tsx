"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Reveals a figure's labels once, the first time it scrolls into view (figures.md, Motion).
 * The server renders labels visible, so the figure reads without JavaScript; after hydration
 * this hides them (`data-reveal="pending"`) and plays the reveal when at least a third of the
 * figure is on screen. Reduced motion skips straight to the revealed state.
 */
export function FigureReveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      root.dataset.reveal = "done";
      return;
    }
    root.dataset.reveal = "pending";
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        root.dataset.reveal = "done";
        observer.disconnect();
      },
      { threshold: 0.35 },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return <div ref={ref} className="campus-fig-reveal">{children}</div>;
}
