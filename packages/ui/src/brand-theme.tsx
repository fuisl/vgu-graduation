import type {ReactNode} from "react";

/** Opt-in root for the blue-and-white brand theme (redesign #142). */
export function BrandTheme({children}: {children: ReactNode}) {
  return <div data-theme="brand">{children}</div>;
}
