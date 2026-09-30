import type {ReactNode} from "react";
import {ArrowUpRightPixel} from "./arrow-up-right-pixel";

type Props = {
  /** Surface the Cta sits on: on-blue renders a white box, on-white a blue box. */
  tone: "on-blue" | "on-white";
  children: ReactNode;
  /** With href it renders a plain anchor, otherwise a button. */
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  /** Outlined, muted and inert. A disabled link renders without href and with aria-disabled. */
  disabled?: boolean;
};

export function Cta({tone, children, href, onClick, type = "button", disabled}: Props) {
  const className = `brand-cta brand-cta--${tone}`;
  const inner = (
    <>
      <span className="brand-cta__label">{children}</span>
      <span className="brand-cta__tile"><ArrowUpRightPixel /></span>
    </>
  );
  if (href && disabled) {
    // No href: a disabled link must not navigate or take focus.
    return <a className={className} role="link" aria-disabled="true">{inner}</a>;
  }
  return href ? (
    <a className={className} href={href} onClick={onClick}>{inner}</a>
  ) : (
    <button className={className} type={type} onClick={onClick} disabled={disabled}>{inner}</button>
  );
}
