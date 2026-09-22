"use client";

import { useEffect, useState } from "react";

const TITLE = "Coming soon in November.";
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>/*+?#";
const WINDOW = 4;
const WORDS = TITLE.split(" ");

export function WaveTitle() {
  const [noise, setNoise] = useState<Record<number, string>>({});

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frameTimer: number | undefined;
    let nextTimer: number | undefined;

    const sweep = () => {
      if (preference.matches || document.hidden) {
        setNoise({});
        nextTimer = window.setTimeout(sweep, 4500);
        return;
      }

      let position = -WINDOW;
      frameTimer = window.setInterval(() => {
        const next: Record<number, string> = {};
        for (let offset = 0; offset < WINDOW; offset++) {
          const index = position + offset;
          if (index >= 0 && index < TITLE.length && /[A-Za-z]/.test(TITLE[index])) {
            next[index] = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          }
        }
        setNoise(next);
        position++;
        if (position > TITLE.length) {
          window.clearInterval(frameTimer);
          setNoise({});
          nextTimer = window.setTimeout(sweep, 4200);
        }
      }, 42);
    };

    nextTimer = window.setTimeout(sweep, 1800);
    return () => {
      if (frameTimer !== undefined) window.clearInterval(frameTimer);
      if (nextTimer !== undefined) window.clearTimeout(nextTimer);
    };
  }, []);

  let characterIndex = 0;
  return <h2 aria-label={TITLE}>
    {WORDS.map((word, wordIndex) => {
      const start = characterIndex;
      characterIndex += word.length + 1;
      return <span className="landing-title-word" key={wordIndex} aria-hidden="true">
        {[...word].map((character, index) => (
          <span className="landing-title-char" data-original={character} key={index}>
            <span>{noise[start + index] ?? character}</span>
          </span>
        ))}
        {wordIndex < WORDS.length - 1 && " "}
      </span>;
    })}
  </h2>;
}
