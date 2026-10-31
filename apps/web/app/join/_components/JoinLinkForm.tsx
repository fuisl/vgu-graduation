"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { Cta, PaperPlanePixel } from "@grad/ui";
import type { JoinLinkOutcome } from "../../../lib/api/join";
import { sliceTranslator, type MessageSlice } from "../../../lib/i18n/format";
import { askForJoinLink } from "../actions";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = { kind: "idle" } | { kind: "sending" } | { kind: JoinLinkOutcome };

const MESSAGE_KEYS = {
  sending: "graduate.form.sending",
  accepted: "graduate.form.accepted",
  invalid: "graduate.form.invalid",
  unavailable: "graduate.form.failed",
  failed: "graduate.form.failed",
} as const;

/**
 * The graduate's half of self-registration (ADR-015): their email, and the join link goes to the
 * address an admin stored for them. The answer is the same whether or not the address belongs to
 * a graduate, so the copy says "if".
 */
export function JoinLinkForm({ messages }: { messages: MessageSlice<"graduate.form."> }) {
  const t = sliceTranslator(messages);
  const id = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [, startTransition] = useTransition();
  const sending = status.kind === "sending";

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    if (!EMAIL.test(email.trim())) {
      setStatus({ kind: "invalid" });
      return;
    }
    setStatus({ kind: "sending" });
    startTransition(async () => {
      try {
        const outcome = await askForJoinLink(email.trim());
        setStatus({ kind: outcome });
        if (outcome === "accepted") setEmail("");
      } catch {
        setStatus({ kind: "failed" });
      }
    });
  }

  return (
    <form className="join-form" onSubmit={onSubmit} noValidate aria-describedby={`${id}-status`}>
      <div className="join-field">
        <label className="join-label" htmlFor={`${id}-email`}>{t("graduate.form.email")}</label>
        <input
          id={`${id}-email`}
          className="join-input"
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          maxLength={254}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (status.kind !== "idle" && !sending) setStatus({ kind: "idle" });
          }}
          aria-invalid={status.kind === "invalid"}
          required
        />
        <p className="join-hint">{t("graduate.form.hint")}</p>
      </div>
      <div>
        <Cta tone="on-white" type="submit" icon={<PaperPlanePixel />} aria-disabled={sending}>
          {sending ? t("graduate.form.sending") : t("graduate.form.submit")}
        </Cta>
      </div>
      <p id={`${id}-status`} className="join-status" role="status">
        {status.kind !== "idle" ? t(MESSAGE_KEYS[status.kind]) : null}
      </p>
    </form>
  );
}
