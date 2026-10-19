import Link from "next/link";
import { listAdminMedia, listAdminWishes } from "../../../../lib/api/admin";
import {
  mediaFilterQuery,
  parseQueueView,
  QUEUE_FILTERS,
  QUEUE_PAGE_SIZE,
  queueHref,
  wishFilterQuery,
  type QueueKind,
  type QueueView,
} from "../../../../lib/admin/moderation";
import { redirectIfUnauthorized, requireAdminSession } from "../../../../lib/admin/session";
import { LoadError } from "../../_components/LoadError";
import { PhotoQueue, WishQueue } from "../../_components/ModerationQueue";

const KINDS: { kind: QueueKind; label: string }[] = [
  { kind: "photos", label: "Photos" },
  { kind: "wishes", label: "Wishes" },
];

function Tabs({ view }: { view: QueueView }) {
  return (
    <>
      <nav className="admin-tabs" aria-label="Moderate">
        <ul>
          {KINDS.map(({ kind, label }) => (
            <li key={kind}>
              <Link
                href={queueHref({ kind, filter: "latest" })}
                prefetch={false}
                aria-current={view.kind === kind ? "page" : undefined}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <nav className="admin-filters" aria-label="Filter">
        <ul>
          {QUEUE_FILTERS[view.kind].map((option) => (
            <li key={option.id}>
              <Link
                href={queueHref({ kind: view.kind, filter: option.id })}
                prefetch={false}
                aria-current={view.filter === option.id ? "page" : undefined}
              >
                {option.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

/**
 * Moderation queue (#64) and the curated public set (#75). Takedown only:
 * everything shows at once and moderators hide or remove afterwards. Every
 * change is audited by the API and revalidates the cached public listings.
 */
export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string | string[]; filter?: string | string[] }>;
}) {
  const { token } = await requireAdminSession();
  const view = parseQueueView(await searchParams);

  return (
    <>
      <h1>Moderation</h1>
      <p className="admin-muted admin-lead">
        Photos and wishes show as soon as guests post them. Hide takes one down for now; Remove is for takedown
        requests. Show puts it back. Public adds a visible one to the after-ceremony public gallery.
      </p>
      <Tabs view={view} />
      {view.kind === "photos" ? <Photos token={token} view={view} /> : <Wishes token={token} view={view} />}
    </>
  );
}

async function Photos({ token, view }: { token: string; view: QueueView }) {
  const page = await listAdminMedia(token, { ...mediaFilterQuery(view.filter), limit: QUEUE_PAGE_SIZE.photos });
  redirectIfUnauthorized(page);
  if (page.status !== "ok") return <LoadError what="photos" result={page} />;
  // Keyed by filter so switching views starts a fresh list instead of keeping the old one's state.
  return <PhotoQueue key={view.filter} filter={view.filter} initial={page.data} />;
}

async function Wishes({ token, view }: { token: string; view: QueueView }) {
  const page = await listAdminWishes(token, { ...wishFilterQuery(view.filter), limit: QUEUE_PAGE_SIZE.wishes });
  redirectIfUnauthorized(page);
  if (page.status !== "ok") return <LoadError what="wishes" result={page} />;
  return <WishQueue key={view.filter} filter={view.filter} initial={page.data} />;
}
