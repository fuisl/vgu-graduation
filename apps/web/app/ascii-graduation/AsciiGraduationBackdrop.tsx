"use client";

import { useEffect, useRef } from "react";

const WORDS = [
  "GRAD '26", "VGU", "CAMPUS", "NOVEMBER", "2026", "CLASS OF", "TOGETHER", "MEMORY", "ARCHIVE", "NEXT CHAPTER",
  "SOFTWARE", "ENGINEERING", "DATA", "FINANCE", "INNOVATION", "WISHES", "GALLERY", "CEREMONY", "HCMC", "FOUR YEARS",
  "RSVP", "INVITATION", "PROUD", "FAMILY", "FRIENDS", "THANK YOU", "CONGRATULATIONS", "BEGIN", "WALK", "CAP & GOWN",
];
const NOISE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·:/-+*#%@=<>";
const CELL_W = 7.8;
const CELL_H = 14;
const SOURCE_CROP = { x: 70, y: 85, width: 830, height: 430 };
const SUPERSAMPLE = 3;
const KEY = 10000;
const TICK_MS = 140;
const SCRAMBLE_REACH = 15; // cells; scramble probability falls off as exp(-distance / reach)
const SCRAMBLE_RATE = 0.012; // per tick at full strength
const SHADOW_OFFSET = { column: 3, row: 3 };

// Deterministic PRNG so the wall is stable per size and never depends on render-time randomness.
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRows(columns: number, rows: number) {
  const random = seeded(2026);
  return Array.from({ length: rows }, () => {
    let line = " ".repeat(Math.floor(random() * 12));
    while (line.length < columns) line += `${WORDS[Math.floor(random() * WORDS.length)]}${random() > 0.7 ? "  " : " · "}`;
    return line.slice(0, columns);
  });
}

type CapCell = { level: number; shade: number };
type Scramble = { until: number; char: string };

export function AsciiGraduationBackdrop() {
  const stageRef = useRef<HTMLElement>(null);
  const fieldRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const field = fieldRef.current;
    const image = imageRef.current;
    const context = field?.getContext("2d");
    if (!stage || !field || !image || !context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const font = "600 10px var(--font-mono), ui-monospace, monospace";
    let base: HTMLCanvasElement | undefined;
    let rows: string[] = [];
    let columns = 0;
    let rowCount = 0;
    let dpr = 1;
    let cap = new Map<number, CapCell>();
    let candidates: { key: number; chance: number }[] = [];
    let active = new Map<number, Scramble>();
    let frame: number | undefined;
    let visible = false;
    let lastAt = 0;
    let disposed = false;

    // Per-cell brightness of the cap plus a lighting term. Level is ink + edges; shade treats level as a
    // height field lit from the upper left, so rims facing the light are icy and the far sides fall to violet.
    const buildCap = (width: number) => {
      const next = new Map<number, CapCell>();
      if (!image.naturalWidth) return next;
      const compact = width < 720;
      const capWidth = compact ? width * 0.86 : Math.min(720, Math.max(320, width * 0.36));
      const capColumns = Math.round(capWidth / CELL_W);
      const capRows = Math.round((capWidth * SOURCE_CROP.height) / SOURCE_CROP.width / CELL_H);
      const left = compact ? Math.round((columns - capColumns) / 2) : Math.round(columns - capColumns - columns * 0.07);
      const top = compact ? Math.round(rowCount * 0.56) : Math.round((rowCount - capRows) / 2);
      const sample = document.createElement("canvas");
      sample.width = capColumns * SUPERSAMPLE;
      sample.height = capRows * SUPERSAMPLE;
      const sampleContext = sample.getContext("2d", { willReadFrequently: true });
      if (!sampleContext) return next;
      sampleContext.fillStyle = "#fff";
      sampleContext.fillRect(0, 0, sample.width, sample.height);
      sampleContext.drawImage(image, SOURCE_CROP.x, SOURCE_CROP.y, SOURCE_CROP.width, SOURCE_CROP.height, 0, 0, sample.width, sample.height);
      const pixels = sampleContext.getImageData(0, 0, sample.width, sample.height).data;
      const signal = new Float32Array(sample.width * sample.height);
      for (let index = 0; index < signal.length; index += 1) {
        const red = pixels[index * 4];
        const green = pixels[index * 4 + 1];
        const blue = pixels[index * 4 + 2];
        const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
        const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
        const value = Math.max(Math.max(0, 215 - luminance) * 1.15, chroma > 60 ? chroma * 2.2 : 0);
        // The cutoff removes the white page and the pale stock watermark.
        signal[index] = value < 28 ? 0 : Math.min(255, value) / 255;
      }
      const level = new Float32Array(capColumns * capRows);
      for (let row = 0; row < capRows; row += 1) {
        for (let column = 0; column < capColumns; column += 1) {
          let sum = 0;
          let low = 1;
          let high = 0;
          for (let y = 0; y < SUPERSAMPLE; y += 1) {
            for (let x = 0; x < SUPERSAMPLE; x += 1) {
              const value = signal[(row * SUPERSAMPLE + y) * sample.width + column * SUPERSAMPLE + x];
              sum += value;
              low = Math.min(low, value);
              high = Math.max(high, value);
            }
          }
          const mean = sum / (SUPERSAMPLE * SUPERSAMPLE);
          level[row * capColumns + column] = Math.min(1, Math.pow(mean * 1.5 + (high - low) * 1.1, 0.7));
        }
      }
      // Height field: smooth the level over a 5x5 window so the slope reads as form, not as pixel noise.
      const height = new Float32Array(level.length);
      for (let row = 0; row < capRows; row += 1) {
        for (let column = 0; column < capColumns; column += 1) {
          let sum = 0;
          let count = 0;
          for (let y = -2; y <= 2; y += 1) {
            for (let x = -2; x <= 2; x += 1) {
              const r = row + y;
              const c = column + x;
              if (r < 0 || c < 0 || r >= capRows || c >= capColumns) continue;
              sum += level[r * capColumns + c];
              count += 1;
            }
          }
          height[row * capColumns + column] = sum / count;
        }
      }
      const at = (row: number, column: number) => height[Math.min(capRows - 1, Math.max(0, row)) * capColumns + Math.min(capColumns - 1, Math.max(0, column))];
      for (let row = 0; row < capRows; row += 1) {
        for (let column = 0; column < capColumns; column += 1) {
          const value = level[row * capColumns + column];
          if (value <= 0.1) continue;
          const slopeX = at(row, column + 1) - at(row, column - 1);
          const slopeY = at(row + 1, column) - at(row - 1, column);
          const shade = Math.min(1, Math.max(0, 0.5 - (slopeX * 0.75 + slopeY * 1.0) * 5));
          next.set((top + row) * KEY + left + column, { level: value, shade });
        }
      }
      return next;
    };

    // Chamfer distance (in cells) from the cap, used to fade the scramble out with distance.
    const buildCandidates = () => {
      const distance = new Float32Array(columns * rowCount).fill(1e6);
      cap.forEach((cell, key) => {
        if (cell.level < 0.3) return;
        const row = Math.floor(key / KEY);
        const column = key % KEY;
        if (row < rowCount && column < columns) distance[row * columns + column] = 0;
      });
      for (let row = 0; row < rowCount; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const i = row * columns + column;
          if (column > 0) distance[i] = Math.min(distance[i], distance[i - 1] + 1);
          if (row > 0) distance[i] = Math.min(distance[i], distance[i - columns] + 1);
          if (row > 0 && column > 0) distance[i] = Math.min(distance[i], distance[i - columns - 1] + 1.4);
        }
      }
      for (let row = rowCount - 1; row >= 0; row -= 1) {
        for (let column = columns - 1; column >= 0; column -= 1) {
          const i = row * columns + column;
          if (column < columns - 1) distance[i] = Math.min(distance[i], distance[i + 1] + 1);
          if (row < rowCount - 1) distance[i] = Math.min(distance[i], distance[i + columns] + 1);
          if (row < rowCount - 1 && column < columns - 1) distance[i] = Math.min(distance[i], distance[i + columns + 1] + 1.4);
        }
      }
      const list: { key: number; chance: number }[] = [];
      for (let row = 0; row < rowCount; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          if (rows[row][column] === " " && !cap.has(row * KEY + column)) continue;
          const chance = Math.exp(-distance[row * columns + column] / SCRAMBLE_REACH);
          if (chance > 0.03) list.push({ key: row * KEY + column, chance });
        }
      }
      return list;
    };

    const capColor = (cell: CapCell) => {
      const lift = cell.level * (0.35 + cell.shade * 0.95);
      // Violet shadow -> blue midtone -> icy highlight, matching the sculpture's shader gradient.
      const red = Math.round(118 + cell.shade * 118);
      const green = Math.round(128 + cell.shade * 116);
      const blue = Math.round(226 + cell.shade * 29);
      return `rgba(${red},${green},${blue},${Math.min(1, 0.22 + lift * 0.85)})`;
    };
    const WALL_COLOR = "rgba(143,158,194,.11)";
    const SHADOW_COLOR = "rgba(143,158,194,.035)";

    const drawCell = (target: CanvasRenderingContext2D, row: number, column: number, char: string) => {
      const cell = cap.get(row * KEY + column);
      const x = column * CELL_W;
      const y = row * CELL_H;
      if (cell) {
        target.shadowColor = "rgba(112,150,240,.85)";
        target.shadowBlur = 11;
        target.fillStyle = capColor(cell);
        target.fillText(char === " " ? "·" : char, x, y);
        target.shadowBlur = 0;
        return;
      }
      if (char === " ") return;
      // Cells just down-right of the cap dim further, so the cap floats above the wall.
      const under = cap.get((row - SHADOW_OFFSET.row) * KEY + column - SHADOW_OFFSET.column);
      target.fillStyle = under && under.level > 0.35 ? SHADOW_COLOR : WALL_COLOR;
      target.fillText(char, x, y);
    };

    const layout = () => {
      const { width, height } = stage.getBoundingClientRect();
      if (!width || !height) return;
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      columns = Math.ceil(width / CELL_W);
      rowCount = Math.ceil(height / CELL_H);
      rows = buildRows(columns, rowCount);
      cap = buildCap(width);
      candidates = buildCandidates();
      active = new Map();
      field.width = Math.round(width * dpr);
      field.height = Math.round(height * dpr);
      base = document.createElement("canvas");
      base.width = field.width;
      base.height = field.height;
      const baseContext = base.getContext("2d");
      if (!baseContext) return;
      baseContext.scale(dpr, dpr);
      baseContext.font = font;
      baseContext.textBaseline = "top";
      rows.forEach((line, row) => {
        for (let column = 0; column < line.length; column += 1) drawCell(baseContext, row, column, line[column]);
      });
      cap.forEach((_, key) => {
        const row = Math.floor(key / KEY);
        const column = key % KEY;
        if (row < rowCount && column < columns && rows[row][column] === " ") drawCell(baseContext, row, column, " ");
      });
      paint();
    };

    const paint = () => {
      if (!base) return;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, field.width, field.height);
      context.drawImage(base, 0, 0);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.font = font;
      context.textBaseline = "top";
      active.forEach((scramble, key) => {
        const row = Math.floor(key / KEY);
        const column = key % KEY;
        context.clearRect(column * CELL_W, row * CELL_H, CELL_W, CELL_H);
        // Same color as the resting glyph: the scramble changes the letter, never the brightness.
        drawCell(context, row, column, scramble.char);
      });
    };

    const tick = (now: number) => {
      frame = undefined;
      if (disposed || !visible || document.hidden) return;
      if (now - lastAt >= TICK_MS) {
        lastAt = now;
        active.forEach((scramble, key) => {
          if (now >= scramble.until) active.delete(key);
          else if (Math.random() > 0.7) scramble.char = NOISE[Math.floor(Math.random() * NOISE.length)];
        });
        for (const { key, chance } of candidates) {
          if (active.has(key) || Math.random() > chance * SCRAMBLE_RATE) continue;
          active.set(key, { until: now + 700 + Math.random() * 1100, char: NOISE[Math.floor(Math.random() * NOISE.length)] });
        }
        paint();
      }
      frame = window.requestAnimationFrame(tick);
    };

    const schedule = () => {
      if (frame === undefined && visible && !document.hidden && !reducedMotion.matches) frame = window.requestAnimationFrame(tick);
    };

    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) schedule();
      else if (frame !== undefined) {
        window.cancelAnimationFrame(frame);
        frame = undefined;
      }
    }, { rootMargin: "10% 0px" });
    const resize = new ResizeObserver(layout);
    const handleVisibility = () => schedule();
    const handleMotion = () => {
      active = new Map();
      paint();
      schedule();
    };

    image.addEventListener("load", layout);
    document.addEventListener("visibilitychange", handleVisibility);
    reducedMotion.addEventListener("change", handleMotion);
    intersection.observe(stage);
    resize.observe(stage);
    layout();

    return () => {
      disposed = true;
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      image.removeEventListener("load", layout);
      document.removeEventListener("visibilitychange", handleVisibility);
      reducedMotion.removeEventListener("change", handleMotion);
      intersection.disconnect();
      resize.disconnect();
    };
  }, []);

  return <section ref={stageRef} className="landing-ascii-chapter" aria-label="ASCII graduation cap">
    <canvas ref={fieldRef} className="landing-ascii-field" aria-hidden="true" />
    <div className="landing-ascii-shade" aria-hidden="true" />
    {/* Hidden source: only sampled into a per-cell mask, never displayed. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img ref={imageRef} className="landing-ascii-source" src="/media/graduation-cap.png" alt="" aria-hidden="true" />
  </section>;
}
