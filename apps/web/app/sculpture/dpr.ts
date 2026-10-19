/**
 * Pixel-ratio policy for the sculpture canvas (#6, #147, #78).
 *
 * The canvas draws at up to the device's own ratio, capped at 3 (2 on devices that report 4 or
 * fewer cores or 2 GB or less of memory), and steps down at run time while frames are slow
 * (`FrameBudget` in Sculpture.tsx). Only the cheap glyph pass runs at that ratio: the particle
 * scene and the cell pass render at most at `SCENE_DPR_CAP`, because the cell pass reads only nine
 * samples per character cell. So DPR 3 costs one more full-screen quad, not a 3x scene.
 */
export const MAX_DPR = 3;
export const LOW_END_MAX_DPR = 2;
export const SCENE_DPR_CAP = 2;
/** The ratios FrameBudget steps through when frames are slow; never below 1. */
export const DPR_STEPS = [3, 2, 1.5, 1] as const;

/** Starting ratio for this device. `cores` and `memoryGb` are navigator hints and may be missing. */
export function initialDpr(device: number, cores?: number, memoryGb?: number): number {
  const lowEnd = (cores !== undefined && cores <= 4) || (memoryGb !== undefined && memoryGb <= 2);
  return Math.max(1, Math.min(device || 1, lowEnd ? LOW_END_MAX_DPR : MAX_DPR));
}

/** The next step below `dpr`, or 1 at the floor. */
export function lowerDpr(dpr: number): number {
  return DPR_STEPS.find((step) => step < dpr) ?? 1;
}

/** Whole device pixels per character cell, so every cell is the same size and glyphs sit on the pixel grid. */
export function cellPixels(cssCellWidth: number, cssCellHeight: number, ratio: number): [number, number] {
  return [Math.max(1, Math.round(cssCellWidth * ratio)), Math.max(1, Math.round(cssCellHeight * ratio))];
}

/** The character grid over a drawing buffer: whole cells, centred, the remainder (under one cell) left clear. */
export function gridLayout(width: number, height: number, cellWidth: number, cellHeight: number) {
  const columns = Math.max(1, Math.floor(width / cellWidth));
  const rows = Math.max(1, Math.floor(height / cellHeight));
  return {
    columns,
    rows,
    offsetX: Math.floor((width - columns * cellWidth) / 2),
    offsetY: Math.floor((height - rows * cellHeight) / 2),
  };
}
