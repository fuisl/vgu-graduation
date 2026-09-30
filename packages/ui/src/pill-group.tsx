import type {ReactNode} from "react";

type Tone = "on-blue" | "on-white";

type Props = {
  /** nav (default): PillItem links with aria-current in a nav landmark. toggle: PillToggle buttons with aria-pressed in a role="group". */
  as?: "nav" | "toggle";
  label: string;
  tone?: Tone;
  children: ReactNode;
};

/**
 * Segmented group. `label` names the landmark or group.
 * `tone` is the surface: on-blue (default) a deep-blue container, on-white a soft-blue one.
 */
export function PillGroup({as = "nav", label, tone = "on-blue", children}: Props) {
  if (as === "toggle") {
    return <div className={`brand-pills brand-pills--${tone} brand-pills--toggle`} role="group" aria-label={label}>{children}</div>;
  }
  return <nav className={`brand-pills brand-pills--${tone}`} aria-label={label}>{children}</nav>;
}

/** Text link inside a nav PillGroup; `current` renders the active pill. */
export function PillItem({href, current = false, children}: {href: string; current?: boolean; children: ReactNode}) {
  return <a className="brand-pill" href={href} aria-current={current ? "page" : undefined}>{children}</a>;
}

/** Button inside a toggle PillGroup; `pressed` renders the active pill and sets aria-pressed. */
export function PillToggle({pressed, onClick, children, "aria-label": ariaLabel, title}: {
  pressed: boolean;
  onClick?: () => void;
  children: ReactNode;
  "aria-label"?: string;
  title?: string;
}) {
  return <button className="brand-pill" type="button" aria-pressed={pressed} onClick={onClick} aria-label={ariaLabel} title={title}>{children}</button>;
}
