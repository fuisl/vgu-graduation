import type {ReactNode} from "react";
import {Container} from "./container";

type Props = {
  tone: "blue" | "white";
  children: ReactNode;
  narrow?: boolean;
  id?: string;
  "aria-labelledby"?: string;
};

/** Full-bleed band; content sits in Container. Text colours follow the tone. */
export function Section({tone, children, narrow, id, "aria-labelledby": labelledBy}: Props) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={`brand-section brand-section--${tone}`}>
      <Container narrow={narrow}>{children}</Container>
    </section>
  );
}
