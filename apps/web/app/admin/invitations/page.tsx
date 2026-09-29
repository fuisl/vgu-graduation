import Link from "next/link";
import { Rule } from "@grad/ui";
import { listGraduates, listInvitations } from "../../../lib/api/admin";
import { DEFAULT_EVENT_TIME_ZONE, formatAdminDateTime } from "../../../lib/admin/datetime";
import { describeRsvp } from "../../../lib/admin/overview";
import { redirectIfUnauthorized, requireAdminSession } from "../../../lib/admin/session";
import { InvitationActions } from "../_components/InvitationActions";
import { InvitationForm } from "../_components/InvitationForm";
import { LoadError } from "../_components/LoadError";

export default async function InvitationsPage() {
  const { token } = await requireAdminSession();
  const [graduates, invitations] = await Promise.all([listGraduates(token), listInvitations(token)]);
  redirectIfUnauthorized(graduates);
  redirectIfUnauthorized(invitations);

  return (
    <>
      <h1>Invitations</h1>

      {graduates.status !== "ok" ? (
        <LoadError what="graduates for the invitation form" result={graduates} />
      ) : graduates.data.items.length === 0 ? (
        <p>
          Invitations are sent on behalf of graduates. <Link href="/admin/graduates">Add a graduate</Link> first.
        </p>
      ) : (
        <InvitationForm
          graduates={graduates.data.items.map(({ id, name, email }) => ({ id, name, email }))}
        />
      )}

      <Rule />

      <h2 id="invitations-heading">All invitations</h2>
      {invitations.status !== "ok" ? (
        <LoadError what="invitations" result={invitations} />
      ) : invitations.data.items.length === 0 ? (
        <p>No invitations yet.</p>
      ) : (
        <div className="admin-table-wrap" role="region" aria-labelledby="invitations-heading" tabIndex={0}>
          <table className="admin-table">
            <caption className="admin-muted">
              {invitations.data.items.length} invitation{invitations.data.items.length === 1 ? "" : "s"}, newest first.
              Links are never shown here; rotate to issue a new one.
            </caption>
            <thead>
              <tr>
                <th scope="col">Guest</th>
                <th scope="col">Invited by</th>
                <th scope="col">Status</th>
                <th scope="col">RSVP</th>
                <th scope="col">Created</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invitations.data.items.map((invitation) => (
                <tr key={invitation.id}>
                  <td>
                    {invitation.guest.name}
                    {invitation.guest.email ? <div className="admin-muted">{invitation.guest.email}</div> : null}
                    {invitation.guest.phone ? <div className="admin-muted">{invitation.guest.phone}</div> : null}
                  </td>
                  <td>{invitation.inviters.map((inviter) => inviter.name).join(", ") || "—"}</td>
                  <td>{invitation.status === "active" ? "Active" : "Revoked"}</td>
                  <td>{describeRsvp(invitation.rsvp, invitation.maxPlusOnes)}</td>
                  <td>{formatAdminDateTime(invitation.createdAt, DEFAULT_EVENT_TIME_ZONE)}</td>
                  <td>
                    {invitation.status === "active" ? (
                      <InvitationActions invitationId={invitation.id} guestName={invitation.guest.name} />
                    ) : (
                      <span className="admin-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
