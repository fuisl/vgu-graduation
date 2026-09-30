import type { AdminAccount } from "@grad/contract";
import { Rule } from "@grad/ui";
import { getAdminMe, listAdminAccounts } from "../../../../lib/api/admin";
import { DEFAULT_EVENT_TIME_ZONE, formatAdminDateTime } from "../../../../lib/admin/datetime";
import { redirectIfNotAdmin, redirectIfUnauthorized, requireAdminSession } from "../../../../lib/admin/session";
import { AdminAccountActions } from "../../_components/AdminAccountActions";
import { LoadError } from "../../_components/LoadError";

const STATUS_LABEL: Record<AdminAccount["status"], string> = {
  pending: "Waiting",
  approved: "Admin",
  rejected: "Rejected",
  revoked: "Revoked",
};

function AccountTable({ id, caption, accounts }: { id: string; caption: string; accounts: AdminAccount[] }) {
  return (
    <div className="admin-table-wrap" role="region" aria-labelledby={id} tabIndex={0}>
      <table className="admin-table">
        <caption id={id} className="admin-muted">
          {caption}
        </caption>
        <thead>
          <tr>
            <th scope="col">GitHub</th>
            <th scope="col">Status</th>
            <th scope="col">Requested</th>
            <th scope="col">Decided</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => (
            <tr key={account.handle}>
              <td>
                <a href={`https://github.com/${account.handle}`} target="_blank" rel="noreferrer">
                  {account.handle}
                </a>
              </td>
              <td>{account.owner ? "Owner" : STATUS_LABEL[account.status]}</td>
              <td>{formatAdminDateTime(account.requestedAt, DEFAULT_EVENT_TIME_ZONE)}</td>
              <td>
                {account.decidedAt
                  ? `${formatAdminDateTime(account.decidedAt, DEFAULT_EVENT_TIME_ZONE)} by ${account.decidedBy}`
                  : "—"}
              </td>
              <td>
                {account.owner ? (
                  <span className="admin-muted">Owners are fixed in the API</span>
                ) : (
                  <AdminAccountActions handle={account.handle} status={account.status} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminsPage() {
  const { token } = await requireAdminSession();
  const me = await getAdminMe(token);
  redirectIfNotAdmin(me);

  if (me.status === "ok" && !me.data.owner) {
    return (
      <>
        <h1>Admins</h1>
        <p>Only owners can approve or revoke admins.</p>
      </>
    );
  }

  const accounts = await listAdminAccounts(token);
  redirectIfUnauthorized(accounts);
  const items = accounts.status === "ok" ? accounts.data.items : [];
  const pending = items.filter((a) => a.status === "pending");
  const admins = items.filter((a) => a.status === "approved" || a.owner);
  const declined = items.filter((a) => (a.status === "rejected" || a.status === "revoked") && !a.owner);

  return (
    <>
      <h1>Admins</h1>
      <p className="admin-muted">
        Anyone who signs in with GitHub appears here as a request. Only approve people you know are part of the
        organising team.
      </p>
      {accounts.status !== "ok" ? (
        <LoadError what="admin accounts" result={accounts} />
      ) : (
        <>
          <h2>Requests</h2>
          {pending.length === 0 ? (
            <p>No requests waiting.</p>
          ) : (
            <AccountTable
              id="requests-caption"
              caption={`${pending.length} waiting for approval, newest first`}
              accounts={pending}
            />
          )}
          <Rule />
          <h2>Admins</h2>
          <AccountTable id="admins-caption" caption={`${admins.length} with access`} accounts={admins} />
          {declined.length > 0 ? (
            <>
              <Rule />
              <h2>Rejected and revoked</h2>
              <AccountTable
                id="declined-caption"
                caption={`${declined.length} without access; approve to let them in`}
                accounts={declined}
              />
            </>
          ) : null}
        </>
      )}
    </>
  );
}
