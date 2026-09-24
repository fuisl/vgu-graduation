"use client";

import { useEffect, useRef, useState } from "react";

type NoiseFamily = "ascii" | "block" | "braille";
type NoiseGlyph = { character: string; family: NoiseFamily };

const NOISE: Record<NoiseFamily, string> = {
  ascii: "#%&@*+=:./\\<>[]",
  block: "░▒▓█▚▞▙▟▀▄▘▝▖▗",
  braille: "⠁⠃⠇⡇⣇⣧⣷⣿",
};
const FAMILIES = Object.keys(NOISE) as NoiseFamily[];

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

export function DecodeText({
  text,
  delay = 0,
  duration = 760,
  repeatDelay,
  variant = "decode",
  sweepWidth = 5,
  className = "",
  ariaHidden = false,
}: {
  text: string;
  delay?: number;
  duration?: number;
  repeatDelay?: number;
  variant?: "decode" | "sweep";
  sweepWidth?: number;
  className?: string;
  ariaHidden?: boolean;
}) {
  const [noise, setNoise] = useState<Record<number, NoiseGlyph>>({});
  const played = useRef(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const positions = Array.from(text, (character, index) => /[\p{L}\p{N}]/u.test(character) ? index : -1).filter((index) => index >= 0);
    let animationFrame: number | undefined;
    let nextTimer: number | undefined;
    let cycle = 0;

    const clearScheduled = () => {
      if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
      if (nextTimer !== undefined) window.clearTimeout(nextTimer);
      animationFrame = undefined;
      nextTimer = undefined;
    };

    const schedule = (wait: number) => {
      nextTimer = window.setTimeout(decode, wait);
    };

    const decode = () => {
      if (preference.matches || document.hidden || (played.current && repeatDelay === undefined)) {
        setNoise({});
        return;
      }

      played.current = true;
      cycle += 1;
      const startedAt = performance.now();
      let lastFrame = -1;

      const tick = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const frame = Math.floor((now - startedAt) / 34);

        if (frame !== lastFrame) {
          const next: Record<number, NoiseGlyph> = {};
          const travel = progress * (positions.length + sweepWidth);
          const sweepStart = Math.floor(travel) - sweepWidth;
          const start = variant === "sweep" ? Math.max(0, sweepStart) : Math.floor(progress * (positions.length + 1));
          const end = variant === "sweep" ? Math.min(positions.length, sweepStart + sweepWidth) : positions.length;
          for (let position = start; position < end; position++) {
            const index = positions[position];
            next[index] = noiseAt(index, frame, cycle);
          }
          setNoise(next);
          lastFrame = frame;
        }

        if (progress < 1) animationFrame = window.requestAnimationFrame(tick);
        else {
          setNoise({});
          if (repeatDelay !== undefined) schedule(repeatDelay);
        }
      };

      animationFrame = window.requestAnimationFrame(tick);
    };

    const syncMotion = () => {
      clearScheduled();
      setNoise({});
      if (!preference.matches && !document.hidden && repeatDelay !== undefined) schedule(1200);
    };

    preference.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncMotion);
    schedule(delay);

    return () => {
      clearScheduled();
      preference.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncMotion);
    };
  }, [delay, duration, repeatDelay, sweepWidth, text, variant]);

  let characterIndex = 0;
  const words = text.split(" ");

  return <span className={`landing-decode ${className}`.trim()} aria-hidden={ariaHidden || undefined}>
    <span className="landing-decode-visual" aria-hidden="true">
      {words.map((word, wordIndex) => {
        const start = characterIndex;
        characterIndex += Array.from(word).length + 1;
        return <span className="landing-decode-word" key={`${word}-${wordIndex}`}>
          {Array.from(word).map((character, index) => {
            const replacement = noise[start + index];
            return <span className="landing-decode-char" data-original={character} key={index}>
              <span className={replacement ? `is-noise is-${replacement.family}` : undefined}>
                {replacement?.character ?? character}
              </span>
            </span>;
          })}
          {wordIndex < words.length - 1 && " "}
        </span>;
      })}
    </span>
    {!ariaHidden && <span className="sr-only">{text}</span>}
  </span>;
}
