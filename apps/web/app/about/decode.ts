/**
 * Frame maths for the /about portrait reveal (#7): the portrait prints top to bottom like a
 * terminal, each glyph passing through ASCII noise before it settles. Pure, so it is unit-tested;
 * PortraitReveal only schedules frames.
 */

/** Noise glyphs: the sculpture ramp without the space (landing.md). */
export const NOISE = ".:-=+*#%@";
export const REVEAL_MS = 1100;

/**
 * Per-cell timings (ms after start) for a target with `\n`-separated rows: a cell starts as blank,
 * shows noise from `appear`, and shows its glyph from `settle`. Rows sweep down over the first
 * 55% of the reveal; each cell then settles after a jittered delay.
 */
export function revealTimings(target: string, duration = REVEAL_MS, random: () => number = Math.random) {
  const rows = target.split("\n");
  const count = Math.max(rows.length, 1);
  const appear: number[] = [];
  const settle: number[] = [];
  rows.forEach((row, r) => {
    const rowStart = (r / count) * duration * 0.55;
    for (let c = 0; c < row.length; c += 1) {
      appear.push(rowStart);
      settle.push(Math.min(duration, rowStart + duration * (0.15 + 0.3 * random())));
    }
    appear.push(0); // the newline
    settle.push(0);
  });
  return { appear, settle };
}

/** The text to show `elapsed` ms into the reveal. Spaces and newlines never flicker. */
export function revealFrame(
  target: string,
  elapsed: number,
  timings: { appear: number[]; settle: number[] },
  random: () => number = Math.random,
): string {
  let out = "";
  for (let i = 0; i < target.length; i += 1) {
    const ch = target[i];
    if (ch === "\n" || ch === " " || elapsed >= timings.settle[i]) out += ch;
    else if (elapsed < timings.appear[i]) out += " ";
    else out += NOISE[Math.floor(random() * NOISE.length)];
  }
  return out;
}
