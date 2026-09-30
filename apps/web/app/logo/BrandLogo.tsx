/* The logo is a small pre-sized PNG; the Next image optimizer would add a hop for no gain. */
/* eslint-disable @next/next/no-img-element */

export type BrandLogoVariant = "full" | "compact";
export type BrandLogoTone = "on-blue" | "on-white";

/** Intrinsic sizes of the files in public/brand (2x the largest display size). */
const ASSETS: Record<BrandLogoVariant, Record<BrandLogoTone, { src: string; width: number; height: number }>> = {
  full: {
    "on-white": { src: "/brand/logo-full.png", width: 960, height: 226 },
    "on-blue": { src: "/brand/logo-full-on-blue.png", width: 960, height: 226 },
  },
  compact: {
    "on-white": { src: "/brand/logo-compact.png", width: 512, height: 512 },
    "on-blue": { src: "/brand/logo-compact-on-blue.png", width: 512, height: 512 },
  },
};

/**
 * The Fuisloy pixel logo. `full` is the wordmark, `compact` the "F" mark.
 * `tone` is the surface it sits on: the original blues read on white; on a blue
 * surface the blocks turn white and pale blue so the mark stays visible.
 * Size it from the parent (width or height via CSS); the aspect ratio is fixed.
 */
export function BrandLogo({
  variant = "full",
  tone = "on-white",
  className,
  alt = "Fuisloy",
}: {
  variant?: BrandLogoVariant;
  tone?: BrandLogoTone;
  className?: string;
  alt?: string;
}) {
  const asset = ASSETS[variant][tone];
  return (
    <img
      src={asset.src}
      width={asset.width}
      height={asset.height}
      alt={alt}
      className={["brand-logo-img", className].filter(Boolean).join(" ")}
      decoding="async"
    />
  );
}
