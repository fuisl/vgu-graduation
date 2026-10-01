import type {ReactNode} from "react";

type Props = {
  tone: "blue" | "white" | "blue-deep";
  /** Vertical rhythm: airy (default, about 6rem desktop / 4rem mobile) or compact (about 3rem / 2rem). */
  density?: "airy" | "compact";
  children: ReactNode;
  narrow?: boolean;
  id?: string;
  "aria-labelledby"?: string;
};

/**
 * Full-bleed band; content sits in `.brand-section-inner`, capped at --brand-content (1600px).
 * Text colours follow the tone. Does not use the shared Container, whose width is for non-brand pages.
 */
export function Section({tone, density = "airy", children, narrow, id, "aria-labelledby": labelledBy}: Props) {
  const inner = narrow ? "brand-section-inner brand-section-inner--narrow" : "brand-section-inner";
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`brand-section brand-section--${tone} brand-section--${density}`}
    >
      <div className={inner}>{children}</div>
    </section>
  );
}
