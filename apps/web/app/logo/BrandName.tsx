"use client";

import { useEffect, useRef, useState } from "react";

// Each segment's prefix is the acronym letter (V, G, U); "rest" is what grows out of it
// when expanded, so "VGU" reads as embedded inside "Vietnamese-German University" rather
// than being swapped for it.
const SEGMENTS = [
  { prefix: "V", rest: "ietnamese-" },
  { prefix: "G", rest: "erman " },
  { prefix: "U", rest: "niversity" },
];
const REST_CHARS = SEGMENTS.flatMap((segment) => [...segment.rest]);
const NOISE = "!<>-_/\\[]{}=+*^?#%@$&:.";

type CharState = { open: boolean; glyph: string };

// Full name is the resting state, so the first paint (server and pre-hydration client)
// already shows it — no hydration mismatch, no flash of the compact form on load.
function expandedChars(): CharState[] {
  return REST_CHARS.map((ch) => ({ open: true, glyph: ch }));
}

function collapsedChars(): CharState[] {
  return REST_CHARS.map(() => ({ open: false, glyph: "" }));
}

function randomNoise() {
  return NOISE[Math.floor(Math.random() * NOISE.length)];
}

export function BrandName() {
  const [expanded, setExpanded] = useState(true);
  const [chars, setChars] = useState<CharState[]>(expandedChars);
  const hovered = useRef(false);
  const scrolled = useRef(false);
  const active = useRef(true);
  const reducedMotion = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const applyStateRef = useRef<() => void>(() => {});

  useEffect(() => {
    const clearTimers = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };

    // Each character grows its slot open, then briefly cycles through ascii noise
    // before settling on its real letter — a short decode rather than a fade/slide.
    const reveal = () => {
      clearTimers();
      if (reducedMotion.current) {
        setChars(expandedChars());
        return;
      }
      REST_CHARS.forEach((target, i) => {
        const start = i * 9;
        const setAt = (delay: number, glyph: string) => {
          timers.current.push(setTimeout(() => {
            setChars((prev) => {
              const next = prev.slice();
              next[i] = { open: true, glyph };
              return next;
            });
          }, delay));
        };
        setAt(start, randomNoise());
        setAt(start + 26, randomNoise());
        setAt(start + 52, randomNoise());
        setAt(start + 78, target);
      });
    };

    const collapse = () => {
      clearTimers();
      setChars(collapsedChars());
    };

    // Resting (not scrolled) shows the full name; scrolling down compacts it to "VGU".
    // Hovering while scrolled overrides the compact form so the full name can still be peeked.
    const applyState = () => {
      const next = hovered.current || !scrolled.current;
      if (next === active.current) return;
      active.current = next;
      setExpanded(next);
      if (next) reveal(); else collapse();
    };
    applyStateRef.current = applyState;

    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion.current = preference.matches;
    const onPreferenceChange = () => { reducedMotion.current = preference.matches; };
    preference.addEventListener("change", onPreferenceChange);

    const onScroll = () => {
      const next = window.scrollY > 8;
      if (next !== scrolled.current) {
        scrolled.current = next;
        applyState();
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      preference.removeEventListener("change", onPreferenceChange);
      window.removeEventListener("scroll", onScroll);
      clearTimers();
    };
  }, []);

  const setHovered = (value: boolean) => {
    hovered.current = value;
    applyStateRef.current();
  };

  let cursor = 0;

  return (
    <span
      className={`brand-name${expanded ? " is-expanded" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span aria-hidden="true">
        {SEGMENTS.map((segment, si) => (
          <span className="brand-segment" key={si}>
            <span className="brand-prefix">{segment.prefix}</span>
            <span className="brand-rest">
              {[...segment.rest].map(() => {
                const i = cursor++;
                const state = chars[i];
                return (
                  <span className={`brand-char${state.open ? " is-open" : ""}`} key={i}>
                    {state.glyph || " "}
                  </span>
                );
              })}
            </span>
          </span>
        ))}
      </span>
      <span className="sr-only">Vietnamese-German University</span>
    </span>
  );
}
