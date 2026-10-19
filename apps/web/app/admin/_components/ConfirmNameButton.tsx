"use client";

import { useActionState } from "react";
import { IDLE, type QuickActionState } from "../../../lib/admin/action-state";
import { confirmNameAction } from "../name-actions";
import { SubmitButton } from "./SubmitButton";

/**
 * One-tap "Looks right" for a guessed given/family split (#170): sets
 * `nameReviewed`. Once saved the row re-renders without the badge.
 */
export function ConfirmNameButton({
  kind,
  id,
  displayName,
}: {
  kind: "graduate" | "invitation";
  id: string;
  displayName: string;
}) {
  const [state, action] = useActionState<QuickActionState, FormData>(confirmNameAction, IDLE);
  return (
    <form action={action} className="admin-inline-form">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <SubmitButton pendingLabel="Saving…" variant="outline" accessibleLabel={`Name of ${displayName} looks right`}>
        Looks right
      </SubmitButton>
      {state.status === "error" ? (
        <p role="alert" className="admin-field-error">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/** The given/family split with a "check" badge while it is the API's guess. */
export function NameSplit({
  givenName,
  familyName,
  reviewed,
}: {
  givenName?: string;
  familyName?: string | null;
  reviewed?: boolean;
}) {
  if (!givenName) return <span className="admin-muted">—</span>;
  return (
    <span className="admin-name-split-value">
      <span>
        <span className="admin-muted">Given </span>
        {givenName}
        {familyName ? (
          <>
            {" · "}
            <span className="admin-muted">Family </span>
            {familyName}
          </>
        ) : null}
      </span>
      {reviewed === false ? <span className="admin-badge">Check name</span> : null}
    </span>
  );
}
