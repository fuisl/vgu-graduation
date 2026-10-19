import type { ReactNode } from "react";

/**
 * The blue band the name badge hangs in (`badge.css`). On phones the badge has the top of the
 * band and `children` (the page's few lines and its action) follow below it; from 961px the text
 * sits on the left over the stage and the badge hangs on the right. Render it as the first child
 * of `<main>`, so the band runs up behind the header and the lanyard hangs from just under it.
 * `className` adds a modifier (`badge-stage--full` on /guest/prototype).
 */
export function BadgeStage({ badge, labelledBy, className, children }: {
  badge: ReactNode;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`badge-stage${className ? ` ${className}` : ""}`} aria-labelledby={labelledBy}>
      <div className="badge-stage__scene">{badge}</div>
      <div className="badge-stage__content">{children}</div>
    </section>
  );
}
