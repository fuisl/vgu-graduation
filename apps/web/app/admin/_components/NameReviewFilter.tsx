import Link from "next/link";
import { nameReviewHref } from "../../../lib/admin/name-review";

/** "All / Names to check (n)" toggle above a list (#170). Server component: plain links. */
export function NameReviewFilter({
  basePath,
  reviewOnly,
  toReview,
  what,
}: {
  basePath: string;
  reviewOnly: boolean;
  toReview: number;
  /** Singular noun for the hint, e.g. "graduate", "guest". */
  what: string;
}) {
  return (
    <div className="admin-filter">
      <nav aria-label="Filter" className="admin-filter__links">
        <Link href={basePath} prefetch={false} aria-current={reviewOnly ? undefined : "page"}>
          All
        </Link>
        <Link href={nameReviewHref(basePath)} prefetch={false} aria-current={reviewOnly ? "page" : undefined}>
          Names to check ({toReview})
        </Link>
      </nav>
      {toReview > 0 ? (
        <p className="admin-hint">
          {toReview} {what} name{toReview === 1 ? " was" : "s were"} split into given and family name automatically. Check
          each: “Looks right” confirms it, Edit fixes it.
        </p>
      ) : null}
    </div>
  );
}
