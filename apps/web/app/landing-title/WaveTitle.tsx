"use client";

import { useEffect, useState } from "react";

const TITLE = "Coming soon in November.";
const WORDS = TITLE.split(" ");
const DECODE_MS = 760;
const HOLD_MS = 4200;

type NoiseFamily = "ascii" | "block" | "braille";
type NoiseGlyph = { character: string; family: NoiseFamily };

// ASCIIGen's marketing decoder uses the block + ASCII families. Its engine and
// live demos add Braille; keeping the families separate makes each equally
// present instead of letting the largest Unicode range dominate the texture.
const NOISE: Record<NoiseFamily, string> = {
  ascii: "#%&@*+=:./\\<>[]",
  block: "░▒▓█▚▞▙▟▀▄▘▝▖▗",
  braille: "⠁⠃⠇⡇⣇⣧⣷⣿",
};
const FAMILIES = Object.keys(NOISE) as NoiseFamily[];
const SCRAMBLE_POSITIONS = Array.from(TITLE, (character, index) => /[A-Za-z]/.test(character) ? index : -1).filter((index) => index >= 0);

function hash(value: number) {
  let next = value | 0;
  next = Math.imul(next ^ (next >>> 16), 0x45d9f3b);
  next = Math.imul(next ^ (next >>> 16), 0x45d9f3b);
  return (next ^ (next >>> 16)) >>> 0;
}

function noiseAt(index: number, frame: number, cycle: number): NoiseGlyph {
  const seed = hash(index * 131 + frame * 977 + cycle * 7919);
  const family = FAMILIES[seed % FAMILIES.length];
  const glyphs = Array.from(NOISE[family]);
  return { character: glyphs[hash(seed + 17) % glyphs.length], family };
}

export function WaveTitle() {
  const [noise, setNoise] = useState<Record<number, NoiseGlyph>>({});

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrame: number | undefined;
    let nextTimer: number | undefined;
    let cycle = 0;

    const clearScheduled = () => {
      if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
      if (nextTimer !== undefined) window.clearTimeout(nextTimer);
      animationFrame = undefined;
      nextTimer = undefined;
    };

    const schedule = (delay: number) => {
      nextTimer = window.setTimeout(decode, delay);
    };

    const decode = () => {
      if (preference.matches || document.hidden) {
        setNoise({});
        return;
      }

      const startedAt = performance.now();
      let lastFrame = -1;
      cycle += 1;

      const tick = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / DECODE_MS);
        const resolved = Math.floor(progress * (SCRAMBLE_POSITIONS.length + 1));
        const frame = Math.floor((now - startedAt) / 34);

        if (frame !== lastFrame) {
          const next: Record<number, NoiseGlyph> = {};
          for (let position = resolved; position < SCRAMBLE_POSITIONS.length; position++) {
            const index = SCRAMBLE_POSITIONS[position];
            next[index] = noiseAt(index, frame, cycle);
          }
          setNoise(next);
          lastFrame = frame;
        }

        if (progress < 1) animationFrame = window.requestAnimationFrame(tick);
        else {
          setNoise({});
          schedule(HOLD_MS);
        }
      };

      animationFrame = window.requestAnimationFrame(tick);
    };

    const syncMotion = () => {
      clearScheduled();
      setNoise({});
      if (!preference.matches && !document.hidden) schedule(1200);
    };

    preference.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncMotion);
    schedule(1800);

    return () => {
      clearScheduled();
      preference.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncMotion);
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
            <span className={noise[start + index] ? `is-noise is-${noise[start + index].family}` : undefined}>
              {noise[start + index]?.character ?? character}
            </span>
          </span>
        ))}
        {wordIndex < WORDS.length - 1 && " "}
      </span>;
    })}
  </h2>;
}
