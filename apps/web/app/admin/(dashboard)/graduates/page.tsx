import Link from "next/link";
import { Rule } from "@grad/ui";
import { listGraduates } from "../../../../lib/api/admin";
import { DEFAULT_EVENT_TIME_ZONE, formatAdminDateTime } from "../../../../lib/admin/datetime";
import { isNameReviewFilter } from "../../../../lib/admin/name-review";
import { redirectIfUnauthorized, requireAdminSession } from "../../../../lib/admin/session";
import { ConfirmNameButton, NameSplit } from "../../_components/ConfirmNameButton";
import { GraduateForm } from "../../_components/GraduateForm";
import { LoadError } from "../../_components/LoadError";
import { NameReviewFilter } from "../../_components/NameReviewFilter";

export default async function GraduatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await requireAdminSession();
  const reviewOnly = isNameReviewFilter(await searchParams);
  const graduates = await listGraduates(token);
  redirectIfUnauthorized(graduates);

  const all = graduates.status === "ok" ? graduates.data.items : [];
  const toReview = all.filter((graduate) => graduate.nameReviewed === false).length;
  const rows = reviewOnly ? all.filter((graduate) => graduate.nameReviewed === false) : all;

  return (
    <>
      <h1>Graduates</h1>
      <p className="admin-muted">Graduates are the inviters on invitations. They never sign in.</p>
      {graduates.status !== "ok" ? (
        <LoadError what="graduates" result={graduates} />
      ) : all.length === 0 ? (
        <p>No graduates yet. Add the first one below.</p>
      ) : (
        <>
          <NameReviewFilter basePath="/admin/graduates" reviewOnly={reviewOnly} toReview={toReview} what="graduate" />
          {rows.length === 0 ? (
            <p>
              Every name is checked. <Link href="/admin/graduates">Show all graduates</Link>.
            </p>
          ) : (
            <div className="admin-table-wrap" role="region" aria-labelledby="graduates-caption" tabIndex={0}>
              <table className="admin-table admin-table--stack">
                <caption id="graduates-caption" className="admin-muted">
                  {rows.length} graduate{rows.length === 1 ? "" : "s"}
                  {reviewOnly ? " with a name to check" : ""}, sorted by name
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Called by</th>
                    <th scope="col">Email</th>
                    <th scope="col">Added</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((graduate) => (
                    <tr key={graduate.id}>
                      <td>{graduate.name}</td>
                      <td data-label="Called by">
                        <NameSplit
                          givenName={graduate.givenName}
                          familyName={graduate.familyName}
                          reviewed={graduate.nameReviewed}
                        />
                      </td>
                      <td data-label="Email">{graduate.email}</td>
                      <td data-label="Added">{formatAdminDateTime(graduate.createdAt, DEFAULT_EVENT_TIME_ZONE)}</td>
                      <td>
                        <div className="admin-actions">
                          {graduate.nameReviewed === false ? (
                            <ConfirmNameButton kind="graduate" id={graduate.id} displayName={graduate.name} />
                          ) : null}
                          <Link
                            href={`/admin/graduates/${graduate.id}`}
                            prefetch={false}
                            className="admin-button admin-button--outline"
                            aria-label={`Edit ${graduate.name}`}
                          >
                            Edit
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <Rule />
      <GraduateForm />
    </>
  );
}
