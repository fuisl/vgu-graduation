"use client";

import { useActionState, type MouseEvent } from "react";
import { IDLE, type QuickActionState } from "../../../lib/admin/action-state";
import { deleteGuideItemAction, setGuideItemActiveAction } from "../guide-actions";
import { SubmitButton } from "./SubmitButton";

function closeDetails(event: MouseEvent<HTMLButtonElement>) {
  const details = event.currentTarget.closest("details");
  details?.removeAttribute("open");
  details?.querySelector("summary")?.focus();
}

/**
 * Show/hide is one tap because it is reversible and keeps every pick; delete
 * sits behind a <details> confirm step, like revoke on invitations.
 */
export function GuideItemActions({
  id,
  title,
  active,
  children,
}: {
  id: string;
  title: string;
  active: boolean;
  /** Placed between show/hide and delete, e.g. the Edit disclosure, so the destructive action comes last. */
  children?: React.ReactNode;
}) {
  const [toggleState, toggleAction] = useActionState<QuickActionState, FormData>(setGuideItemActiveAction, IDLE);
  const [deleteState, deleteAction] = useActionState<QuickActionState, FormData>(deleteGuideItemAction, IDLE);

  return (
    <div className="admin-stack">
      {toggleState.status === "error" ? (
        <p role="alert" className="admin-field-error">
          {toggleState.message}
        </p>
      ) : null}
      {deleteState.status === "error" ? (
        <p role="alert" className="admin-field-error">
          Delete failed: {deleteState.message}
        </p>
      ) : null}
      <div className="admin-actions">
        <form action={toggleAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="active" value={active ? "false" : "true"} />
          <SubmitButton
            pendingLabel={active ? "Hiding…" : "Showing…"}
            variant="outline"
            accessibleLabel={`${active ? "Hide" : "Show"} ${title} ${active ? "from" : "to"} guests`}
          >
            {active ? "Hide from guests" : "Show to guests"}
          </SubmitButton>
        </form>
        {children}
        <details className="admin-details">
          <summary className="admin-button admin-button--outline" aria-label={`Delete ${title}…`}>
            Delete…
          </summary>
          <form action={deleteAction}>
            <input type="hidden" name="id" value={id} />
            <p>
              “{title}” is removed for good, and so is every invitation&apos;s pick of it. To keep it for later, hide
              it instead.
            </p>
            <div className="admin-actions">
              <SubmitButton pendingLabel="Deleting…">Confirm delete</SubmitButton>
              <button type="button" className="admin-button admin-button--outline" onClick={closeDetails}>
                Cancel
              </button>
            </div>
          </form>
        </details>
      </div>
    </div>
  );
}
