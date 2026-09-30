"use client";

import type { AdminAccessStatus } from "@grad/contract";
import { useActionState, type MouseEvent } from "react";
import { IDLE, type AdminAccountActionState } from "../../../lib/admin/action-state";
import { decideAdminAccountAction } from "../actions";
import { SubmitButton } from "./SubmitButton";

function closeDetails(event: MouseEvent<HTMLButtonElement>) {
  const details = event.currentTarget.closest("details");
  details?.removeAttribute("open");
  details?.querySelector("summary")?.focus();
}

/**
 * Owner decisions for one account (#119). Approve is one click because it is
 * reversible; reject and revoke sit behind a <details> confirm step, like
 * rotate and revoke on invitations.
 */
export function AdminAccountActions({ handle, status }: { handle: string; status: AdminAccessStatus }) {
  const [state, action] = useActionState<AdminAccountActionState, FormData>(decideAdminAccountAction, IDLE);

  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      {state.status === "error" ? (
        <p role="alert" className="admin-field-error">
          {state.message}
        </p>
      ) : null}
      <div className="admin-actions">
        {status !== "approved" ? (
          <form action={action}>
            <input type="hidden" name="handle" value={handle} />
            <input type="hidden" name="decision" value="approve" />
            <SubmitButton pendingLabel="Approving…">{status === "pending" ? "Approve" : "Approve again"}</SubmitButton>
          </form>
        ) : null}
        {status === "pending" ? (
          <details className="admin-details">
            <summary className="admin-button admin-button--outline">Reject…</summary>
            <form action={action}>
              <input type="hidden" name="handle" value={handle} />
              <input type="hidden" name="decision" value="reject" />
              <p>{handle} stays signed out. Signing in again won&apos;t reopen the request; you can approve them later.</p>
              <div className="admin-actions">
                <SubmitButton pendingLabel="Rejecting…">Confirm reject</SubmitButton>
                <button type="button" className="admin-button admin-button--outline" onClick={closeDetails}>
                  Cancel
                </button>
              </div>
            </form>
          </details>
        ) : null}
        {status === "approved" ? (
          <details className="admin-details">
            <summary className="admin-button admin-button--outline">Revoke…</summary>
            <form action={action}>
              <input type="hidden" name="handle" value={handle} />
              <input type="hidden" name="decision" value="revoke" />
              <p>{handle} loses admin access on their next page load. You can approve them again later.</p>
              <div className="admin-actions">
                <SubmitButton pendingLabel="Revoking…">Confirm revoke</SubmitButton>
                <button type="button" className="admin-button admin-button--outline" onClick={closeDetails}>
                  Cancel
                </button>
              </div>
            </form>
          </details>
        ) : null}
      </div>
    </div>
  );
}
