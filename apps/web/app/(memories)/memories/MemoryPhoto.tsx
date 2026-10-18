/* Derivatives are immutable, pre-sized JPEGs with their own srcset; a Next image proxy would add a hop. */
/* eslint-disable @next/next/no-img-element */

import type { GalleryItem } from "@grad/contract";
import { photoSources } from "../../../lib/memories/images";

type Props = {
  photo: GalleryItem;
  origin: string;
  /** `sizes` for this slot, so the browser picks the thumb on phones. */
  sizes: string;
  alt: string;
  /** Above-the-fold photos load eagerly; everything else is lazy. */
  eager?: boolean;
  className?: string;
};

/** One curated photo: the thumb with a srcset up to the display derivative, linking to the display image. */
export function MemoryPhoto({ photo, origin, sizes, alt, eager = false, className }: Props) {
  const image = photoSources(photo, origin);
  return (
    <a className={className} href={image.displayUrl}>
      <img
        src={image.src}
        srcSet={image.srcSet}
        sizes={sizes}
        width={image.width}
        height={image.height}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
      />
    </a>
  );
}
