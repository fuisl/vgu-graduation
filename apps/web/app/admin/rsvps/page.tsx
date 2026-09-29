import { listRsvps } from "../../../lib/api/admin";
import { DEFAULT_EVENT_TIME_ZONE, formatAdminDateTime } from "../../../lib/admin/datetime";
import { describeRsvp } from "../../../lib/admin/overview";
import { redirectIfUnauthorized, requireAdminSession } from "../../../lib/admin/session";
import { LoadError } from "../_components/LoadError";

export default async function RsvpsPage() {
  const { token } = await requireAdminSession();
  const rsvps = await listRsvps(token);
  redirectIfUnauthorized(rsvps);

  return (
    <>
      <h1 id="rsvps-heading">RSVPs</h1>
      {rsvps.status !== "ok" ? (
        <LoadError what="RSVPs" result={rsvps} />
      ) : rsvps.data.items.length === 0 ? (
        <p>No invitations yet, so no RSVPs.</p>
      ) : (
        <div className="admin-table-wrap" role="region" aria-labelledby="rsvps-heading" tabIndex={0}>
          <table className="admin-table">
            <caption className="admin-muted">Every invitation and its answer.</caption>
            <thead>
              <tr>
                <th scope="col">Guest</th>
                <th scope="col">Answer</th>
                <th scope="col">Dietary requirements</th>
                <th scope="col">Notes</th>
                <th scope="col">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rsvps.data.items.map((row) => (
                <tr key={row.invitationId}>
                  <td>{row.guestName}</td>
                  <td>{describeRsvp(row.rsvp, row.maxPlusOnes)}</td>
                  <td>{row.rsvp?.dietaryRequirements || "—"}</td>
                  <td style={{ whiteSpace: "pre-line" }}>{row.rsvp?.notes || "—"}</td>
                  <td>{row.rsvp ? formatAdminDateTime(row.rsvp.updatedAt, DEFAULT_EVENT_TIME_ZONE) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
