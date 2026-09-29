import { Rule } from "@grad/ui";
import { listGraduates } from "../../../lib/api/admin";
import { DEFAULT_EVENT_TIME_ZONE, formatAdminDateTime } from "../../../lib/admin/datetime";
import { redirectIfUnauthorized, requireAdminSession } from "../../../lib/admin/session";
import { GraduateForm } from "../_components/GraduateForm";
import { LoadError } from "../_components/LoadError";

export default async function GraduatesPage() {
  const { token } = await requireAdminSession();
  const graduates = await listGraduates(token);
  redirectIfUnauthorized(graduates);

  return (
    <>
      <h1>Graduates</h1>
      <p className="admin-muted">Graduates are the inviters on invitations. They never sign in.</p>
      {graduates.status !== "ok" ? (
        <LoadError what="graduates" result={graduates} />
      ) : graduates.data.items.length === 0 ? (
        <p>No graduates yet. Add the first one below.</p>
      ) : (
        <div className="admin-table-wrap" role="region" aria-labelledby="graduates-caption" tabIndex={0}>
          <table className="admin-table">
            <caption id="graduates-caption" className="admin-muted">
              {graduates.data.items.length} graduate{graduates.data.items.length === 1 ? "" : "s"}, sorted by name
            </caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Added</th>
              </tr>
            </thead>
            <tbody>
              {graduates.data.items.map((graduate) => (
                <tr key={graduate.id}>
                  <td>{graduate.name}</td>
                  <td>{graduate.email}</td>
                  <td>{formatAdminDateTime(graduate.createdAt, DEFAULT_EVENT_TIME_ZONE)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Rule />
      <GraduateForm />
    </>
  );
}
