import type { GalleryItem } from "@grad/contract";
import { mediaDerivativeUrl } from "../api/browser-origin";

/**
 * Longest edge of each derivative, mirroring `VARIANTS` in
 * apps/api/src/modules/media/media.variants.ts (never upscaled). Used to give
 * `srcset` true pixel widths so phones pick the 640px thumb and only large or
 * dense screens fetch the 2048px display image. Originals are never linked.
 */
export const VARIANT_MAX_EDGE = { thumb: 640, display: 2048 } as const;

export type PhotoSources = {
  src: string;
  srcSet: string;
  /** Full-size derivative, for the "open photo" link. */
  displayUrl: string;
  /** Intrinsic size of the thumb, for width/height attributes (no layout shift). */
  width: number;
  height: number;
};

function fit(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** `src`, `srcset` and intrinsic size for one curated photo, from its two derivatives. */
export function photoSources(photo: Pick<GalleryItem, "publicId" | "width" | "height">, origin: string): PhotoSources {
  const thumbUrl = mediaDerivativeUrl(photo.publicId, "thumb", origin);
  const displayUrl = mediaDerivativeUrl(photo.publicId, "display", origin);

  // Width and height are null until processing has read them; assume a square, like the grid does.
  if (!photo.width || !photo.height) {
    return {
      src: thumbUrl,
      srcSet: `${thumbUrl} ${VARIANT_MAX_EDGE.thumb}w, ${displayUrl} ${VARIANT_MAX_EDGE.display}w`,
      displayUrl,
      width: VARIANT_MAX_EDGE.thumb,
      height: VARIANT_MAX_EDGE.thumb,
    };
  }

  const thumb = fit(photo.width, photo.height, VARIANT_MAX_EDGE.thumb);
  const display = fit(photo.width, photo.height, VARIANT_MAX_EDGE.display);
  // A small original makes both derivatives the same size; then the thumb alone is enough.
  const srcSet =
    display.width > thumb.width
      ? `${thumbUrl} ${thumb.width}w, ${displayUrl} ${display.width}w`
      : `${thumbUrl} ${thumb.width}w`;
  return { src: thumbUrl, srcSet, displayUrl, width: thumb.width, height: thumb.height };
}
