import type {ReactNode} from "react";

/** Mono uppercase label. Colour follows the surrounding Section tone. No margin: the layout spaces it. */
export function BrandEyebrow({children, ellipsis = false}: {children: ReactNode; ellipsis?: boolean}) {
  return <p className="brand-eyebrow">{children}{ellipsis ? " ..." : null}</p>;
}
