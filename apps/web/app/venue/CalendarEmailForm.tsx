"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { Cta, PaperPlanePixel } from "@grad/ui";
import type { CalendarEmailOutcome } from "../../lib/api/mail";
import { formatRich, sliceTranslator, type MessageSlice } from "../../lib/i18n/format";
import { sendCalendarInvite } from "./calendar-email-action";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = { kind: "idle" } | { kind: "sending" } | { kind: CalendarEmailOutcome };

const MESSAGE_KEYS = {
  sending: "venue.email.sending",
  invalid: "venue.email.invalid",
  sent: "venue.email.sent",
  limited: "venue.email.limited",
  no_invitation: "venue.email.noInvitation",
  unavailable: "venue.email.failed",
  failed: "venue.email.failed",
} as const;

/**
 * Calendar invite by email (#150, ADR-012). Rendered only for a guest with an
 * invitation while the API can send mail, so it never promises an email that
 * can't go. The address is held in this component until submit, then sent to
 * the server action; it is never stored or logged. The .ics link stays below as
 * the fallback for every failure.
 */
export function CalendarEmailForm({ icsHref, messages }: { icsHref: string; messages: MessageSlice<"venue.email."> }) {
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
        const outcome = await sendCalendarInvite(email.trim());
        setStatus({ kind: outcome });
        if (outcome === "sent") setEmail("");
      } catch {
        setStatus({ kind: "failed" });
      }
    });
  }

  return (
    <form className="venue-email" onSubmit={onSubmit} noValidate aria-describedby={`${id}-status`}>
      <label className="venue-label" htmlFor={`${id}-email`}>{t("venue.email.label")}</label>
      <div className="venue-email__row">
        <input
          id={`${id}-email`}
          className="venue-email__input"
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (status.kind !== "idle" && !sending) setStatus({ kind: "idle" });
          }}
          aria-invalid={status.kind === "invalid"}
          required
        />
        <Cta tone="on-blue" type="submit" icon={<PaperPlanePixel />} aria-disabled={sending}>
          {sending ? t("venue.email.sending") : t("venue.email.send")}
        </Cta>
      </div>
      <p id={`${id}-status`} className="venue-email__status" role="status">
        {status.kind !== "idle" ? t(MESSAGE_KEYS[status.kind]) : null}
      </p>
      <p className="venue-email__fallback">
        {formatRich(t("venue.email.fallback"), {
          link: <a className="venue-link" href={icsHref}>{t("venue.email.fallbackLink")}</a>,
        })}
      </p>
    </form>
  );
}
