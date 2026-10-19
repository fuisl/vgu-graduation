"use client";

import type { EmailStatus } from "@grad/contract";
import { useEffect, useId, useRef, useState } from "react";

/** What the admin is told when the link was also emailed (ADR-012). Sent means Gmail accepted it. */
const EMAIL_MESSAGES: Record<EmailStatus, string> = {
  sent: "Emailed to the guest. Keep a copy anyway, in case it lands in spam.",
  failed: "The email could not be sent. Copy the link and send it yourself.",
  not_configured: "Email is not set up on the server, so nothing was sent. Copy the link and send it yourself.",
  no_address: "This guest has no email address, so nothing was sent. Copy the link and send it yourself.",
};

/**
 * Shows a freshly issued invite link exactly once. The link is a bearer
 * credential: it is held only in memory for this render, never written to the
 * URL, storage, cookies or logs. Focus moves here so screen reader and
 * keyboard users land on it.
 */
export function InviteLinkNotice({
  title,
  inviteUrl,
  emailStatus,
  onDismiss,
}: {
  title: string;
  inviteUrl: string;
  /** Present when the admin asked for the link to be emailed. */
  emailStatus?: EmailStatus;
  onDismiss?: () => void;
}) {
  const id = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    headingRef.current?.focus();
  }, [inviteUrl]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopyStatus("copied");
    } catch {
      inputRef.current?.select();
      setCopyStatus("failed");
    }
  }

  return (
    <section className="admin-notice" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} ref={headingRef} tabIndex={-1}>
        {title}
      </h2>
      <p>
        <strong>Copy this link now. It won&apos;t be shown again.</strong> Anyone with the link can open this
        invitation, so send it only to the guest.
      </p>
      {emailStatus ? (
        <p className={emailStatus === "sent" ? undefined : "admin-field-error"}>{EMAIL_MESSAGES[emailStatus]}</p>
      ) : null}
      <div className="admin-field">
        <label htmlFor={`${id}-link`}>Invite link</label>
        <input
          ref={inputRef}
          id={`${id}-link`}
          className="admin-input admin-link-output"
          type="text"
          value={inviteUrl}
          readOnly
          autoComplete="off"
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
        />
      </div>
      <div className="admin-actions">
        <button type="button" className="admin-button" onClick={copy}>
          Copy link
        </button>
        {onDismiss ? (
          <button type="button" className="admin-button admin-button--outline" onClick={onDismiss}>
            I&apos;ve copied it
          </button>
        ) : null}
        <span role="status" className="admin-muted">
          {copyStatus === "copied" ? "Copied." : copyStatus === "failed" ? "Copy failed: the link is selected, copy it manually." : ""}
        </span>
      </div>
    </section>
  );
}
