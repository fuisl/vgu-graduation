import type {ReactNode} from "react";

/**
 * Segmented link group (site navigation). `label` names the landmark.
 * `tone` is the surface: on-blue (default) a deep-blue container, on-white a soft-blue one.
 */
export function PillGroup({label, tone = "on-blue", children}: {label: string; tone?: "on-blue" | "on-white"; children: ReactNode}) {
  return <nav className={`brand-pills brand-pills--${tone}`} aria-label={label}>{children}</nav>;
}

/** Text link inside a PillGroup; `current` renders the active pill. */
export function PillItem({href, current = false, children}: {href: string; current?: boolean; children: ReactNode}) {
  return <a className="brand-pill" href={href} aria-current={current ? "page" : undefined}>{children}</a>;
}
