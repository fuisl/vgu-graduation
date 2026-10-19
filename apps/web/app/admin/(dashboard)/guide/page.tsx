import { Rule } from "@grad/ui";
import { listGuideItems } from "../../../../lib/api/admin";
import { GUIDE_CATEGORY_LABELS } from "../../../../lib/admin/labels";
import { redirectIfUnauthorized, requireAdminSession } from "../../../../lib/admin/session";
import { GuideItemActions } from "../../_components/GuideItemActions";
import { GuideItemForm } from "../../_components/GuideItemForm";
import { LoadError } from "../../_components/LoadError";

/**
 * Guide-book catalogue (#140): places and things to do around campus while the
 * graduates are busy. Every guest sees the items shown to guests, unless their
 * invitation has its own picks (set on the invitation's page).
 */
export default async function GuidePage() {
  const { token } = await requireAdminSession();
  const catalogue = await listGuideItems(token);
  redirectIfUnauthorized(catalogue);

  const items = catalogue.status === "ok" ? catalogue.data.items : [];
  const shown = items.filter((item) => item.active).length;
  const nextSortOrder = items.length === 0 ? 10 : Math.min(10000, Math.max(...items.map((item) => item.sortOrder)) + 10);

  return (
    <>
      <h1 id="guide-heading">Guide-book</h1>
      <p className="admin-muted">
        Guests without picks of their own see every item shown to guests, in sort order. Pick items for one guest on
        their invitation&apos;s page.
      </p>
      {catalogue.status !== "ok" ? (
        <LoadError what="the guide-book" result={catalogue} />
      ) : items.length === 0 ? (
        <p>No items yet. Add the first one below.</p>
      ) : (
        <>
          <p>
            {items.length} item{items.length === 1 ? "" : "s"}, {shown} shown to guests.
          </p>
          <ol className="admin-item-list" aria-labelledby="guide-heading">
            {items.map((item) => (
              <li key={item.id} className="admin-item">
                <div className="admin-item__head">
                  <h2 className="admin-item__title">{item.title}</h2>
                  {item.active ? null : <span className="admin-badge">Hidden from guests</span>}
                </div>
                <p className="admin-muted admin-item__meta">
                  {GUIDE_CATEGORY_LABELS[item.category]}
                  {item.timeHint ? ` · ${item.timeHint}` : ""} · Sort order {item.sortOrder}
                </p>
                {item.description ? <p className="admin-item__text">{item.description}</p> : null}
                {item.mapUrl ? (
                  <p className="admin-item__text">
                    <a href={item.mapUrl} target="_blank" rel="noopener noreferrer">
                      Map link<span className="admin-visually-hidden"> for {item.title} (opens in a new tab)</span>
                    </a>
                  </p>
                ) : null}
                <GuideItemActions id={item.id} title={item.title} active={item.active}>
                  <details className="admin-details admin-details--wide">
                    <summary className="admin-button admin-button--outline" aria-label={`Edit ${item.title}…`}>
                      Edit…
                    </summary>
                    <GuideItemForm item={item} />
                  </details>
                </GuideItemActions>
              </li>
            ))}
          </ol>
        </>
      )}
      <Rule />
      {catalogue.status === "ok" ? <GuideItemForm nextSortOrder={nextSortOrder} /> : null}
    </>
  );
}
