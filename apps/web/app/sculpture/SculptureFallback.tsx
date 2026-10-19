import "./sculpture.css";
import { ShapeCodeBackdrop } from "./CodeBackdrop";

/**
 * The static motif the sculpture shows before (and instead of) the WebGL canvas, as the canvas
 * itself renders it first: the first shape's code backdrop and the ASCII glyph block. A copy of
 * the block in Sculpture.tsx; keep the two identical so the swap to the canvas does not shift.
 */
export const SCULPTURE_MOTIF = `             .   :   .
       .  :  +  *  +  :  .
    . : + * # % @ % # * + : .
  . : + * # % @ @ @ % # * + : .
 . : + * # % @ @ @ @ % # * + : .
  . : + * # % @ @ @ % # * + : .
    . : + * # % @ % # * + : .
       .  :  +  *  +  :  .
             .   :   .`;

/**
 * Server-rendered stand-in for `Sculpture` (QA P1-4): the landing's LCP element, with no three.js
 * behind it. `label` is the resolved accessible name; without one (the brief loading frame before
 * the canvas takes over) it is hidden from assistive tech.
 */
export function SculptureFallback({ label }: { label?: string }) {
  return (
    <div className="sculpture" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <ShapeCodeBackdrop index={0} animate={false} departing={false} />
      <pre className="sculpture-fallback" aria-hidden="true">{SCULPTURE_MOTIF}</pre>
    </div>
  );
}
