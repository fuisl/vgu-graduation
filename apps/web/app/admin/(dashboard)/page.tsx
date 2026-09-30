import Link from "next/link";
import { listInvitations } from "../../../lib/api/admin";
import { computeAdminCounts } from "../../../lib/admin/overview";
import { redirectIfUnauthorized, requireAdminSession } from "../../../lib/admin/session";
import { LoadError } from "../_components/LoadError";

export default async function AdminOverviewPage() {
  const { token } = await requireAdminSession();
  const invitations = await listInvitations(token);
  redirectIfUnauthorized(invitations);

  return (
    <>
      <h1>Overview</h1>
      {invitations.status !== "ok" ? (
        <LoadError what="the invitation counts" result={invitations} />
      ) : invitations.data.items.length === 0 ? (
        <p>
          No invitations yet. <Link href="/admin/graduates">Add graduates</Link>, then{" "}
          <Link href="/admin/invitations">create an invitation</Link>.
        </p>
      ) : (
        <Counts rows={invitations.data.items} />
      )}
    </>
  );
}

function Counts({ rows }: { rows: Parameters<typeof computeAdminCounts>[0] }) {
  const counts = computeAdminCounts(rows);
  return (
    <>
      <section aria-labelledby="overview-invitations">
        <h2 id="overview-invitations">Invitations</h2>
        <dl className="admin-stats">
          <Stat label="Total" value={counts.invitations.total} />
          <Stat label="Active" value={counts.invitations.active} />
          <Stat label="Revoked" value={counts.invitations.revoked} />
        </dl>
      </section>
      <section aria-labelledby="overview-rsvp">
        <h2 id="overview-rsvp">RSVPs</h2>
        <dl className="admin-stats">
          <Stat label="Attending" value={counts.rsvp.attending} />
          <Stat label="Declined" value={counts.rsvp.declined} />
          <Stat label="No answer" value={counts.rsvp.pending} />
          <Stat label="Plus-ones" value={counts.rsvp.plusOnes} />
        </dl>
        <p className="admin-muted">
          Counts cover active invitations only. Plus-ones are those of attending guests.
        </p>
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
