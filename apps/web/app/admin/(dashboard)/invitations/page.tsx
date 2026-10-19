import Link from "next/link";
import { Rule } from "@grad/ui";
import { listGraduates, listInvitations } from "../../../../lib/api/admin";
import { DEFAULT_EVENT_TIME_ZONE, formatAdminDateTime } from "../../../../lib/admin/datetime";
import { isNameReviewFilter } from "../../../../lib/admin/name-review";
import { describeRsvp } from "../../../../lib/admin/overview";
import { redirectIfUnauthorized, requireAdminSession } from "../../../../lib/admin/session";
import { ConfirmNameButton, NameSplit } from "../../_components/ConfirmNameButton";
import { InvitationActions } from "../../_components/InvitationActions";
import { InvitationForm } from "../../_components/InvitationForm";
import { LoadError } from "../../_components/LoadError";
import { NameReviewFilter } from "../../_components/NameReviewFilter";

export default async function InvitationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await requireAdminSession();
  const reviewOnly = isNameReviewFilter(await searchParams);
  const [graduates, invitations] = await Promise.all([listGraduates(token), listInvitations(token)]);
  redirectIfUnauthorized(graduates);
  redirectIfUnauthorized(invitations);

  const all = invitations.status === "ok" ? invitations.data.items : [];
  const unreviewed = all.filter((invitation) => invitation.guest.nameReviewed === false);
  const rows = reviewOnly ? unreviewed : all;

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
      ) : all.length === 0 ? (
        <p>No invitations yet.</p>
      ) : (
        <>
          <NameReviewFilter
            basePath="/admin/invitations"
            reviewOnly={reviewOnly}
            toReview={unreviewed.length}
            what="guest"
          />
          {rows.length === 0 ? (
            <p>
              Every guest name is checked. <Link href="/admin/invitations">Show all invitations</Link>.
            </p>
          ) : (
            <div className="admin-table-wrap" role="region" aria-labelledby="invitations-heading" tabIndex={0}>
              <table className="admin-table admin-table--stack">
                <caption className="admin-muted">
                  {rows.length} invitation{rows.length === 1 ? "" : "s"}
                  {reviewOnly ? " with a guest name to check" : ""}, newest first. Links are never shown here; rotate
                  to issue a new one.
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
                  {rows.map((invitation) => (
                    <tr key={invitation.id}>
                      <td>
                        <Link href={`/admin/invitations/${invitation.id}`} prefetch={false}>
                          {invitation.guest.name}
                        </Link>
                        <div>
                          <NameSplit
                            givenName={invitation.guest.givenName}
                            familyName={invitation.guest.familyName}
                            reviewed={invitation.guest.nameReviewed}
                          />
                        </div>
                        {invitation.guest.email ? <div className="admin-muted">{invitation.guest.email}</div> : null}
                        {invitation.guest.phone ? <div className="admin-muted">{invitation.guest.phone}</div> : null}
                      </td>
                      <td data-label="Invited by">{invitation.inviters.map((inviter) => inviter.name).join(", ") || "—"}</td>
                      <td data-label="Status">{invitation.status === "active" ? "Active" : "Revoked"}</td>
                      <td data-label="RSVP">{describeRsvp(invitation.rsvp, invitation.maxPlusOnes)}</td>
                      <td data-label="Created">{formatAdminDateTime(invitation.createdAt, DEFAULT_EVENT_TIME_ZONE)}</td>
                      <td>
                        <div className="admin-stack">
                          <div className="admin-actions">
                            {invitation.guest.nameReviewed === false ? (
                              <ConfirmNameButton
                                kind="invitation"
                                id={invitation.id}
                                displayName={invitation.guest.name}
                              />
                            ) : null}
                            <Link
                              href={`/admin/invitations/${invitation.id}`}
                              prefetch={false}
                              className="admin-button admin-button--outline"
                              aria-label={`Edit ${invitation.guest.name} and guide-book picks`}
                            >
                              Edit
                            </Link>
                          </div>
                          {invitation.status === "active" ? (
                            <InvitationActions
                              invitationId={invitation.id}
                              guestName={invitation.guest.name}
                              guestEmail={invitation.guest.email}
                            />
                          ) : null}
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
    </>
  );
}
