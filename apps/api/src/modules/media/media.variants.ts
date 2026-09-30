import type { MediaVariant } from "@grad/contract";

/**
 * Derivative sizes (#59). Each variant fits inside a `maxEdge` square, never
 * upscaled, as a baseline sRGB JPEG with every metadata block stripped.
 * `thumb` fills gallery grids; `display` is the full-screen view, the event
 * display and the print source.
 */
export const VARIANTS: Record<MediaVariant, { maxEdge: number; quality: number }> = {
  thumb: { maxEdge: 640, quality: 80 },
  display: { maxEdge: 2048, quality: 85 },
};

/**
 * Object name in `grad-derivatives`: `{random-id}-{variant}.jpg` (decided
 * 2026-09-27). The random `publicId` makes names unguessable and immutable,
 * so they can be cached forever.
 */
export function derivativeKey(publicId: string, variant: MediaVariant): string {
  return `${publicId}-${variant}.jpg`;
}
