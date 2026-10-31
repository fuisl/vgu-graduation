"use client";

import { useActionState, useId, useRef, useState } from "react";
import { IDLE, type JoinLinkActionState } from "../../../lib/admin/action-state";
import { rotateJoinLinkAction } from "../actions";
import { SubmitButton } from "./SubmitButton";

/**
 * A graduate's guest self-registration link (ADR-015). Unlike an invitation link it is stored and
 * meant to be shared, so it stays on the page; the graduate can also get it by email from /graduate.
 * Creating or resetting it sits behind a <details> confirm step when a link already exists,
 * because every copy already shared stops working.
 */
export function JoinLinkPanel({ graduateId, graduateName, joinUrl }: { graduateId: string; graduateName: string; joinUrl: string | null }) {
  const id = useId();
  const [state, action] = useActionState<JoinLinkActionState, FormData>(rotateJoinLinkAction, IDLE);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const url = state.status === "rotated" ? state.joinUrl : joinUrl;

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus("copied");
    } catch {
      inputRef.current?.select();
      setCopyStatus("failed");
    }
  }

  return (
    <section aria-labelledby={`${id}-heading`} style={{ display: "grid", gap: "var(--space-3)" }}>
      <h2 id={`${id}-heading`}>Guest link</h2>
      <p className="admin-muted">
        Guests who open this link register themselves with a name and email and are invited at once, with {graduateName} as
        the inviter. {graduateName} can also get it by email at <code>/graduate</code>.
      </p>
      {url ? (
        <div className="admin-actions">
          <label className="sr-only" htmlFor={`${id}-url`}>
            Guest link for {graduateName}
          </label>
          <input id={`${id}-url`} ref={inputRef} className="admin-input" style={{ flex: "1 1 20rem", width: "auto" }} readOnly value={url} onFocus={(event) => event.currentTarget.select()} />
          <button type="button" className="admin-button" onClick={copy}>
            Copy
          </button>
          <span role="status" className="admin-muted">
            {copyStatus === "copied" ? "Copied." : copyStatus === "failed" ? "Select the link and copy it by hand." : ""}
          </span>
        </div>
      ) : (
        <p>No guest link yet.</p>
      )}
      {state.status === "error" ? (
        <p role="alert" className="admin-field-error">
          Could not change the link: {state.message}
        </p>
      ) : null}
      {url ? (
        <details className="admin-details">
          <summary className="admin-button admin-button--outline">Reset link…</summary>
          <form action={action}>
            <input type="hidden" name="graduateId" value={graduateId} />
            <p>The current link stops working immediately, including copies {graduateName} already shared. Guests who registered keep their invitations.</p>
            <SubmitButton pendingLabel="Resetting…">Confirm reset</SubmitButton>
          </form>
        </details>
      ) : (
        <form action={action}>
          <input type="hidden" name="graduateId" value={graduateId} />
          <SubmitButton pendingLabel="Creating…">Create guest link</SubmitButton>
        </form>
      )}
    </section>
  );
}
