import type {ReactNode} from "react";
import {ArrowUpRightPixel} from "./arrow-up-right-pixel";

type Props = {
  /** Surface the Cta sits on: on-blue renders a white box, on-white a blue box. */
  tone: "on-blue" | "on-white";
  children: ReactNode;
  /**
   * primary (default): filled box with an arrow tile, one per view.
   * secondary: outlined (transparent fill, 1px border, surface-appropriate text) for supporting actions.
   */
  variant?: "primary" | "secondary";
  /** With href it renders a plain anchor, otherwise a button. */
  href?: string;
  /** Link opens in a new tab: adds target and rel, and an sr-only "(opens in a new tab)". Secondary shows the arrow too. */
  external?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  /** Outlined, muted and inert. A disabled link renders without href and with aria-disabled. */
  disabled?: boolean;
  /** Accessible name when the visible label is an icon or glyph. */
  "aria-label"?: string;
  tabIndex?: number;
};

export function Cta({tone, children, variant = "primary", href, external = false, onClick, type = "button", disabled, "aria-label": ariaLabel, tabIndex}: Props) {
  const className = `brand-cta brand-cta--${tone}${variant === "secondary" ? " brand-cta--secondary" : ""}`;
  const isExternal = external && Boolean(href) && !disabled;
  const showArrow = variant === "primary" || isExternal;
  const inner = (
    <>
      <span className="brand-cta__label">{children}</span>
      {isExternal ? <span className="brand-sr-only"> (opens in a new tab)</span> : null}
      {showArrow ? <span className="brand-cta__tile"><ArrowUpRightPixel /></span> : null}
    </>
  );
  if (href && disabled) {
    // No href: a disabled link must not navigate or take focus.
    return <a className={className} role="link" aria-disabled="true" aria-label={ariaLabel}>{inner}</a>;
  }
  return href ? (
    <a
      className={className}
      href={href}
      onClick={onClick}
      aria-label={ariaLabel}
      tabIndex={tabIndex}
      {...(isExternal ? {target: "_blank", rel: "noopener noreferrer"} : {})}
    >{inner}</a>
  ) : (
    <button className={className} type={type} onClick={onClick} disabled={disabled} aria-label={ariaLabel} tabIndex={tabIndex}>{inner}</button>
  );
}
