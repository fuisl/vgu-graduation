"use client";

import { useActionState, useEffect, useRef, useState, type MouseEvent } from "react";
import { IDLE, type InvitationActionState } from "../../../lib/admin/action-state";
import { revokeInvitationAction, rotateInvitationAction } from "../actions";
import { InviteLinkNotice } from "./InviteLinkNotice";
import { SubmitButton } from "./SubmitButton";

function closeDetails(event: MouseEvent<HTMLButtonElement>) {
  const details = event.currentTarget.closest("details");
  details?.removeAttribute("open");
  details?.querySelector("summary")?.focus();
}

/**
 * Rotate and revoke for one active invitation. Each sits behind a
 * <details> confirm step, which works without client JS and by keyboard.
 */
export function InvitationActions({ invitationId, guestName }: { invitationId: string; guestName: string }) {
  const [rotateState, rotateAction] = useActionState<InvitationActionState, FormData>(rotateInvitationAction, IDLE);
  const [revokeState, revokeAction] = useActionState<InvitationActionState, FormData>(revokeInvitationAction, IDLE);
  const [dismissed, setDismissed] = useState<InvitationActionState | null>(null);
  const rotateDetails = useRef<HTMLDetailsElement>(null);

  // Collapse the confirm step once the new link is on screen (the notice takes focus).
  useEffect(() => {
    if (rotateState.status === "rotated") rotateDetails.current?.removeAttribute("open");
  }, [rotateState]);

  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      {rotateState.status === "rotated" && dismissed !== rotateState ? (
        <InviteLinkNotice
          title={`New link for ${guestName}`}
          inviteUrl={rotateState.inviteUrl}
          onDismiss={() => setDismissed(rotateState)}
        />
      ) : null}
      {rotateState.status === "error" ? (
        <p role="alert" className="admin-field-error">
          Rotate failed: {rotateState.message}
        </p>
      ) : null}
      {revokeState.status === "error" ? (
        <p role="alert" className="admin-field-error">
          Revoke failed: {revokeState.message}
        </p>
      ) : null}
      <div className="admin-actions">
        <details className="admin-details" ref={rotateDetails}>
          <summary className="admin-button admin-button--outline">Rotate link…</summary>
          <form action={rotateAction}>
            <input type="hidden" name="invitationId" value={invitationId} />
            <p>The current link for {guestName} stops working immediately and a new one is shown once.</p>
            <div className="admin-actions">
              <SubmitButton pendingLabel="Rotating…">Confirm rotate</SubmitButton>
              <button type="button" className="admin-button admin-button--outline" onClick={closeDetails}>
                Cancel
              </button>
            </div>
          </form>
        </details>
        <details className="admin-details">
          <summary className="admin-button admin-button--outline">Revoke…</summary>
          <form action={revokeAction}>
            <input type="hidden" name="invitationId" value={invitationId} />
            <p>
              {guestName}&apos;s link stops working immediately. This cannot be undone; a new invitation would be
              needed.
            </p>
            <div className="admin-actions">
              <SubmitButton pendingLabel="Revoking…">Confirm revoke</SubmitButton>
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
