"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Cta } from "@grad/ui";
import { sliceTranslator, type MessageSlice } from "../../../lib/i18n/format";

/**
 * The graduate's join link (ADR-015), which is meant to be shared: copy, and the system share sheet
 * where the device has one. It is the same link every time; nothing here can replace it. The share
 * button appears after mount, because the server can't know whether the device can share.
 */
export function GuestLinkPanel({ joinUrl, messages }: { joinUrl: string; messages: MessageSlice<"graduatePortal.link."> }) {
  const t = sliceTranslator(messages);
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [canShare, setCanShare] = useState(false);

  useEffect(() => setCanShare(typeof navigator.share === "function"), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setStatus("copied");
    } catch {
      inputRef.current?.select();
      setStatus("failed");
    }
  }

  async function share() {
    try {
      await navigator.share({ title: t("graduatePortal.link.shareTitle"), url: joinUrl });
    } catch {
      // The person closed the share sheet, or the device refused; copying is right there.
    }
  }

  return (
    <div className="portal-link">
      <p className="join-text">{t("graduatePortal.link.body")}</p>
      <div className="join-field">
        <label className="join-label" htmlFor={`${id}-url`}>{t("graduatePortal.link.fieldLabel")}</label>
        <input
          id={`${id}-url`}
          ref={inputRef}
          className="join-input portal-link__input"
          readOnly
          value={joinUrl}
          onFocus={(event) => event.currentTarget.select()}
        />
      </div>
      <div className="portal-row">
        <Cta tone="on-white" variant="secondary" onClick={copy}>{t("graduatePortal.link.copy")}</Cta>
        {canShare ? (
          <Cta tone="on-white" variant="secondary" onClick={share}>{t("graduatePortal.link.share")}</Cta>
        ) : null}
      </div>
      <p className="portal-status" role="status">
        {status === "copied" ? t("graduatePortal.link.copied") : status === "failed" ? t("graduatePortal.link.copyFailed") : null}
      </p>
    </div>
  );
}
