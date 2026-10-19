import { ArrowUpRightPixel } from "@grad/ui";
import type { ReactNode } from "react";

export type LinkRow = { href: string; label: string; download?: string };

/** One row: the whole row is the 44px+ target, a title and the arrow, between hairlines. */
export function LinkRowItem({ row }: { row: LinkRow }) {
  return (
    <li>
      <a className="invite-row" href={row.href} download={row.download}>
        <span className="invite-row__title">{row.label}</span>
        <span className="invite-row__arrow"><ArrowUpRightPixel /></span>
      </a>
    </li>
  );
}

/**
 * Secondary destinations as compact title-only rows (the guest profile and the invitation), on white.
 * `children` adds rows that resolve later (a `<Suspense>` around a `LinkRowItem`).
 */
export function LinkRows({ rows, labelledBy, children }: { rows: LinkRow[]; labelledBy: string; children?: ReactNode }) {
  return (
    <nav aria-labelledby={labelledBy}>
      <ul className="invite-rows">
        {rows.map((row) => <LinkRowItem key={row.href} row={row} />)}
        {children}
      </ul>
    </nav>
  );
}
