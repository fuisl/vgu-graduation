"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { Cta, PaperPlanePixel } from "@grad/ui";
import type { GraduateInviteOutcome } from "../../../lib/api/graduate";
import { sliceTranslator, type MessageSlice } from "../../../lib/i18n/format";
import { inviteGuest } from "../actions";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = { kind: "idle" } | { kind: "sending" } | { kind: Exclude<GraduateInviteOutcome, "signed_out">; email?: string };

/**
 * Invites one guest (ADR-017): the same path as the join form, with the graduate known from the
 * session. Unlike the public form it says whether an email went, because an invitation can't be
 * sent twice: an address that already has one only joins this graduate's list. The list above
 * refreshes with the action's response. The email stays in the status line until the next edit.
 */
export function InviteForm({ messages }: { messages: MessageSlice<"graduatePortal.invite."> }) {
  const t = sliceTranslator(messages);
  const id = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [, startTransition] = useTransition();
  const sending = status.kind === "sending";

  function clearStatus() {
    if (status.kind !== "idle" && !sending) setStatus({ kind: "idle" });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const typedName = name.trim();
    const typedEmail = email.trim();
    if (!typedName || !EMAIL.test(typedEmail)) {
      setStatus({ kind: "invalid" });
      return;
    }
    setStatus({ kind: "sending" });
    startTransition(async () => {
      try {
        const outcome = await inviteGuest(typedName, typedEmail);
        // A lost session redirects inside the action; this is only here for the types.
        if (outcome === "signed_out") return;
        setStatus({ kind: outcome, email: typedEmail });
        if (outcome === "invited" || outcome === "already_invited") {
          setName("");
          setEmail("");
        }
      } catch {
        setStatus({ kind: "failed" });
      }
    });
  }

  function message(): string | null {
    switch (status.kind) {
      case "idle":
        return null;
      case "sending":
        return t("graduatePortal.invite.sending");
      case "invited":
        return t("graduatePortal.invite.invited", { email: status.email ?? "" });
      case "already_invited":
        return t("graduatePortal.invite.alreadyInvited", { email: status.email ?? "" });
      case "invalid":
        return t("graduatePortal.invite.invalid");
      case "limited":
        return t("graduatePortal.invite.limited");
      case "unavailable":
        return t("graduatePortal.invite.unavailable");
      case "failed":
        return t("graduatePortal.invite.failed");
    }
  }

  const problem = status.kind === "invalid" || status.kind === "failed" || status.kind === "limited" || status.kind === "unavailable";

  return (
    <div className="portal-invite">
      <p className="join-text">{t("graduatePortal.invite.body")}</p>
      <form className="join-form" onSubmit={onSubmit} noValidate aria-describedby={`${id}-status`}>
        <div className="join-field">
          <label className="join-label" htmlFor={`${id}-name`}>{t("graduatePortal.invite.name")}</label>
          <input
            id={`${id}-name`}
            className="join-input"
            name="name"
            autoComplete="off"
            maxLength={120}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              clearStatus();
            }}
            aria-invalid={status.kind === "invalid" && !name.trim()}
            required
          />
        </div>
        <div className="join-field">
          <label className="join-label" htmlFor={`${id}-email`}>{t("graduatePortal.invite.email")}</label>
          <input
            id={`${id}-email`}
            className="join-input"
            type="email"
            name="email"
            inputMode="email"
            autoComplete="off"
            placeholder="name@example.com"
            maxLength={254}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              clearStatus();
            }}
            aria-invalid={status.kind === "invalid" && !EMAIL.test(email.trim())}
            required
          />
          <p className="join-hint">{t("graduatePortal.invite.hint")}</p>
        </div>
        <div>
          <Cta tone="on-white" type="submit" icon={<PaperPlanePixel />} disabled={sending}>
            {sending ? t("graduatePortal.invite.sending") : t("graduatePortal.invite.submit")}
          </Cta>
        </div>
        <p id={`${id}-status`} className={`join-status${problem ? " portal-status--problem" : ""}`} role="status">
          {message()}
        </p>
      </form>
    </div>
  );
}
