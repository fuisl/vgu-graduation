"use client";

import { useEffect, useState } from "react";

const CODE = "404";
const GLYPHS = "01<>[]{}#*+=/\\:;";
const TICK_MS = 60;

export function NotFoundCode() {
  const [glyphs, setGlyphs] = useState<string[]>([...CODE]);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frameTimer: number | undefined;
    let nextTimer: number | undefined;

    // Each character settles a few ticks after the one before it, so the code
    // reads as a left-to-right decode rather than every glyph flipping at once.
    const decode = () => {
      if (preference.matches || document.hidden) {
        setGlyphs([...CODE]);
        nextTimer = window.setTimeout(decode, 5000);
        return;
      }

      let tick = 0;
      const settleAt = CODE.split("").map((_, index) => index * 3 + 4);
      const lastSettle = Math.max(...settleAt);
      frameTimer = window.setInterval(() => {
        setGlyphs(CODE.split("").map((char, index) =>
          tick >= settleAt[index] ? char : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
        ));
        tick++;
        if (tick > lastSettle) {
          window.clearInterval(frameTimer);
          setGlyphs([...CODE]);
          nextTimer = window.setTimeout(decode, 4800);
        }
      }, TICK_MS);
    };

    nextTimer = window.setTimeout(decode, 900);
    return () => {
      if (frameTimer !== undefined) window.clearInterval(frameTimer);
      if (nextTimer !== undefined) window.clearTimeout(nextTimer);
    };
  }, []);

  return <h1 className="notfound-code" aria-label={CODE}>
    {glyphs.map((glyph, index) => (
      <span className="notfound-code-char" key={index} aria-hidden="true">{glyph}</span>
    ))}
  </h1>;
}
