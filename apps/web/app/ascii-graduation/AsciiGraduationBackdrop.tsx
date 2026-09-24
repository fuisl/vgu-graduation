"use client";

import { useEffect, useRef } from "react";

const WORDS = [
  "GRAD '26", "VGU", "CAMPUS", "NOVEMBER", "2026", "CLASS OF", "TOGETHER", "MEMORY", "ARCHIVE", "NEXT CHAPTER",
  "SOFTWARE", "ENGINEERING", "DATA", "FINANCE", "INNOVATION", "WISHES", "GALLERY", "CEREMONY", "HCMC", "FOUR YEARS",
  "RSVP", "INVITATION", "PROUD", "FAMILY", "FRIENDS", "THANK YOU", "CONGRATULATIONS", "BEGIN", "WALK", "CAP & GOWN",
];
const NOISE = "·.:-=+*#%@/\\|<>[]{}01";
const CELL_W = 6.5;
const CELL_H = 12;
const SOURCE_CROP = { x: 70, y: 85, width: 830, height: 430 };
const SUPERSAMPLE = 3;

// Deterministic PRNG so the field is stable per size and never depends on render-time randomness.
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

type Blip = { row: number; column: number; born: number; life: number; char: string };

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
    const font = "600 8.5px var(--font-mono), ui-monospace, monospace";
    let base: HTMLCanvasElement | undefined;
    let rows: string[] = [];
    let columns = 0;
    let rowCount = 0;
    let dpr = 1;
    let blips: Blip[] = [];
    let mask = new Map<number, number>();
    let frame: number | undefined;
    let visible = false;
    let lastAt = 0;
    let disposed = false;

    // Per-cell brightness of the cap (0-1): mean ink plus an edge term so outlines and cloud texture read as light.
    const buildMask = (width: number, height: number) => {
      const next = new Map<number, number>();
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
          const level = Math.min(1, Math.pow(mean * 1.5 + (high - low) * 1.1, 0.7));
          if (level > 0.1) next.set((top + row) * 10000 + left + column, level);
        }
      }
      return next;
    };

    const layout = () => {
      const { width, height } = stage.getBoundingClientRect();
      if (!width || !height) return;
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      columns = Math.ceil(width / CELL_W);
      rowCount = Math.ceil(height / CELL_H);
      rows = buildRows(columns, rowCount);
      mask = buildMask(width, height);
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
      baseContext.fillStyle = "rgba(143,158,194,.22)";
      rows.forEach((line, row) => {
        for (let column = 0; column < line.length; column += 1) {
          if (mask.has(row * 10000 + column)) continue;
          if (line[column] !== " ") baseContext.fillText(line[column], column * CELL_W, row * CELL_H);
        }
      });
      // The cap: the same wall of text, lit by the mask (brightness and glow follow ink and edges).
      baseContext.shadowColor = "rgba(112,150,240,.9)";
      baseContext.shadowBlur = 12;
      mask.forEach((level, key) => {
        const row = Math.floor(key / 10000);
        const column = key % 10000;
        const char = rows[row]?.[column];
        baseContext.fillStyle = level > 0.8 ? `rgba(226,242,255,${0.8 + level * 0.2})` : `rgba(150,182,245,${0.42 + level * 0.5})`;
        baseContext.fillText(char && char !== " " ? char : "·", column * CELL_W, row * CELL_H);
      });
      baseContext.shadowBlur = 0;
      blips = [];
      paint(performance.now());
    };

    const paint = (now: number) => {
      if (!base) return;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, field.width, field.height);
      context.drawImage(base, 0, 0);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.font = font;
      context.textBaseline = "top";
      for (const blip of blips) {
        const age = (now - blip.born) / blip.life;
        if (age < 0 || age > 1) continue;
        const x = blip.column * CELL_W;
        const y = blip.row * CELL_H;
        const original = rows[blip.row]?.[blip.column] ?? " ";
        // Switch through noise glyphs, settle on the real character, then fade with a soft glow.
        const settled = age > 0.45;
        const char = settled ? original : blip.char;
        const strength = age < 0.15 ? age / 0.15 : 1 - Math.max(0, (age - 0.55) / 0.45);
        if (!settled) context.clearRect(x, y, CELL_W, CELL_H);
        context.shadowColor = `rgba(126,164,255,${0.85 * strength})`;
        context.shadowBlur = 12;
        context.fillStyle = settled ? `rgba(190,226,255,${0.9 * strength})` : `rgba(150,176,240,${0.95 * strength})`;
        context.fillText(char === " " ? "·" : char, x, y);
      }
      context.shadowBlur = 0;
    };

    const tick = (now: number) => {
      frame = undefined;
      if (disposed || !visible || document.hidden) return;
      if (now - lastAt >= 66) {
        lastAt = now;
        blips = blips.filter((blip) => now - blip.born < blip.life);
        const target = Math.max(10, Math.round((columns * rowCount) / 340));
        const random = Math.random;
        while (blips.length < target) {
          const row = Math.floor(random() * rowCount);
          const column = Math.floor(random() * columns);
          if (rows[row]?.[column] === " " || mask.has(row * 10000 + column)) continue;
          blips.push({ row, column, born: now + random() * 400, life: 700 + random() * 1300, char: NOISE[Math.floor(random() * NOISE.length)] });
        }
        for (const blip of blips) if (random() > 0.55) blip.char = NOISE[Math.floor(random() * NOISE.length)];
        paint(now);
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
      blips = [];
      paint(performance.now());
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
