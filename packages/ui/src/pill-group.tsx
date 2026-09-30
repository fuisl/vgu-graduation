import type {ReactNode} from "react";

/** Segmented link group (site navigation). `label` names the landmark. */
export function PillGroup({label, children}: {label: string; children: ReactNode}) {
  return <nav className="brand-pills" aria-label={label}>{children}</nav>;
}

/** Text link inside a PillGroup; `current` renders the white active pill. */
export function PillItem({href, current = false, children}: {href: string; current?: boolean; children: ReactNode}) {
  return <a className="brand-pill" href={href} aria-current={current ? "page" : undefined}>{children}</a>;
}
