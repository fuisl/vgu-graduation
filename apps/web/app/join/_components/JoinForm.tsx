"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { Cta, PaperPlanePixel } from "@grad/ui";
import type { JoinOutcome } from "../../../lib/api/join";
import { sliceTranslator, type MessageSlice } from "../../../lib/i18n/format";
import { joinAsGuest } from "../actions";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = { kind: "idle" } | { kind: "sending" } | { kind: JoinOutcome };

const MESSAGE_KEYS = {
  sending: "join.form.sending",
  invalid: "join.form.invalid",
  unknown: "join.form.unknown",
  limited: "join.form.limited",
  unavailable: "join.form.failed",
  failed: "join.form.failed",
} as const;

/**
 * The guest's half of self-registration (ADR-015): name and email, then the invitation arrives by
 * email. On success the form gives way to a "check your inbox" note. `website` is a honeypot,
 * hidden from people and assistive tech; bots that fill it get the normal answer and nothing more.
 */
export function JoinForm({ code, messages }: { code: string; messages: MessageSlice<"join.form."> }) {
  const t = sliceTranslator(messages);
  const id = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [, startTransition] = useTransition();
  const sending = status.kind === "sending";

  if (status.kind === "registered") {
    return (
      <div className="join-done" role="status">
        <h2 className="join-done__title">{t("join.form.doneTitle")}</h2>
        <p className="join-text">{t("join.form.doneBody")}</p>
      </div>
    );
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    if (name.trim().length === 0 || !EMAIL.test(email.trim())) {
      setStatus({ kind: "invalid" });
      return;
    }
    setStatus({ kind: "sending" });
    startTransition(async () => {
      try {
        setStatus({ kind: await joinAsGuest(code, name.trim(), email.trim(), website) });
      } catch {
        setStatus({ kind: "failed" });
      }
    });
  }

  const reset = () => {
    if (status.kind !== "idle" && !sending) setStatus({ kind: "idle" });
  };
  const invalid = status.kind === "invalid";

  return (
    <form className="join-form" onSubmit={onSubmit} noValidate aria-describedby={`${id}-status`}>
      <div className="join-field">
        <label className="join-label" htmlFor={`${id}-name`}>{t("join.form.name")}</label>
        <input
          id={`${id}-name`}
          className="join-input"
          name="name"
          autoComplete="name"
          maxLength={120}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            reset();
          }}
          aria-invalid={invalid && name.trim().length === 0}
          required
        />
      </div>
      <div className="join-field">
        <label className="join-label" htmlFor={`${id}-email`}>{t("join.form.email")}</label>
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
            reset();
          }}
          aria-invalid={invalid && !EMAIL.test(email.trim())}
          required
        />
        <p className="join-hint">{t("join.form.emailHint")}</p>
      </div>
      <div className="join-honeypot" aria-hidden="true">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
      </div>
      <div>
        <Cta tone="on-white" type="submit" icon={<PaperPlanePixel />} aria-disabled={sending}>
          {sending ? t("join.form.sending") : t("join.form.submit")}
        </Cta>
      </div>
      <p id={`${id}-status`} className="join-status" role="status">
        {status.kind !== "idle" ? t(MESSAGE_KEYS[status.kind]) : null}
      </p>
    </form>
  );
}
