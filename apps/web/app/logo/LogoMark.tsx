"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { LOGO_COLS, LOGO_ROWS, RAMP } from "./mark";

const NOISE = "!<>-_\\/[]{}=+*^?#%@$&:.";

type InkCell = { row: number; col: number };

function inkCells(): InkCell[] {
  const cells: InkCell[] = [];
  LOGO_ROWS.forEach((line, row) => {
    for (let col = 0; col < LOGO_COLS; col++) {
      if (line[col] !== " ") cells.push({ row, col });
    }
  });
  return cells;
}

// Shadow -> midtone -> highlight gradient across ink density, in the wordmark's own orange
// (the sculpture's shader does the same blend in its blue-violet palette; this mirrors that
// technique rather than its exact colors, which belong to the sculpture only).
const SHADOW: [number, number, number] = [120, 58, 12];
const MID: [number, number, number] = [245, 129, 31];
const HIGH: [number, number, number] = [255, 214, 140];

function mixChannel(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

function colorForRampIndex(index: number): string {
  const lightness = (index + 0.5) / RAMP.length;
  const [from, to, t] = lightness < 0.5 ? [SHADOW, MID, lightness * 2] : [MID, HIGH, (lightness - 0.5) * 2];
  return `rgb(${mixChannel(from[0], to[0], t)} ${mixChannel(from[1], to[1], t)} ${mixChannel(from[2], to[2], t)})`;
}

type Run = { text: string; color: string | null };

function buildSettledRows(): Run[][] {
  return LOGO_ROWS.map((line) => {
    const runs: Run[] = [];
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      let j = i + 1;
      while (j < line.length && line[j] === ch) j++;
      const index = RAMP.indexOf(ch);
      runs.push({ text: line.slice(i, j), color: index <= 0 ? null : colorForRampIndex(index) });
      i = j;
    }
    return runs;
  });
}

// Computed once from the constant wordmark data, not per render.
const SETTLED_ROWS = buildSettledRows();

export function LogoMark() {
  const cells = useMemo(inkCells, []);
  const [frame, setFrame] = useState<string[] | null>(null);
  const reducedMotion = useRef(false);
  const animating = useRef(false);
  const rafId = useRef<number | null>(null);
  const glitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decodeRef = useRef<(duration: number) => void>(() => {});

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { reducedMotion.current = preference.matches; };
    update();
    preference.addEventListener("change", update);

    const decode = (duration: number) => {
      if (reducedMotion.current || animating.current) return;
      animating.current = true;
      const order = [...cells].sort(() => Math.random() - 0.5);
      const grid = LOGO_ROWS.map((line) => line.split(""));
      const start = performance.now();

      const step = (now: number) => {
        const progress = Math.min(1, (now - start) / duration);
        const lockedCount = Math.floor(progress * order.length);
        for (let k = 0; k < order.length; k++) {
          const { row, col } = order[k];
          grid[row][col] = k < lockedCount ? LOGO_ROWS[row][col] : NOISE[Math.floor(Math.random() * NOISE.length)];
        }
        setFrame(grid.map((line) => line.join("")));
        if (progress < 1) {
          rafId.current = requestAnimationFrame(step);
        } else {
          animating.current = false;
          rafId.current = null;
          setFrame(null);
          scheduleGlitch();
        }
      };
      rafId.current = requestAnimationFrame(step);
    };

    const scheduleGlitch = () => {
      const delay = 9000 + Math.random() * 7000;
      glitchTimer.current = setTimeout(() => {
        if (document.hidden || reducedMotion.current) {
          scheduleGlitch();
          return;
        }
        decode(650);
      }, delay);
    };

    decodeRef.current = decode;
    if (!preference.matches) decode(900);

    return () => {
      preference.removeEventListener("change", update);
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      if (glitchTimer.current) clearTimeout(glitchTimer.current);
    };
  }, [cells]);

  return (
    <span
      className="logo-mark"
      role="img"
      aria-label="VGU"
      onMouseEnter={() => decodeRef.current(500)}
    >
      <pre aria-hidden="true">
        {frame
          ? frame.join("\n")
          : SETTLED_ROWS.map((runs, row) => (
            <Fragment key={row}>
              {runs.map((run, i) => (run.color ? <span key={i} style={{ color: run.color }}>{run.text}</span> : run.text))}
              {row < SETTLED_ROWS.length - 1 ? "\n" : null}
            </Fragment>
          ))}
      </pre>
    </span>
  );
}
