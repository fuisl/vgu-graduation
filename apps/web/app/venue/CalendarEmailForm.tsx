"use client";

import { useId, useState, type FormEvent } from "react";
import { Cta, PaperPlanePixel } from "@grad/ui";
import { formatRich, sliceTranslator, type MessageSlice } from "../../lib/i18n/format";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = { kind: "idle" } | { kind: "invalid" } | { kind: "pending" };

/**
 * Calendar invite by email (#150). The invite email is not built yet, so this is the front end
 * only: it validates the address and says plainly that sending has not started. It never
 * stores, logs or transmits the address. When the email exists, submit to its endpoint here
 * and replace the "pending" copy with a sent confirmation.
 */
export function CalendarEmailForm({ icsHref, messages }: { icsHref: string; messages: MessageSlice<"venue.email."> }) {
  const t = sliceTranslator(messages);
  const id = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(EMAIL.test(email.trim()) ? { kind: "pending" } : { kind: "invalid" });
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
            if (status.kind !== "idle") setStatus({ kind: "idle" });
          }}
          aria-invalid={status.kind === "invalid"}
          required
        />
        <Cta tone="on-blue" type="submit" icon={<PaperPlanePixel />}>{t("venue.email.send")}</Cta>
      </div>
      <p id={`${id}-status`} className="venue-email__status" role="status">
        {status.kind === "invalid" ? t("venue.email.invalid") : null}
        {status.kind === "pending" ? t("venue.email.pending") : null}
      </p>
      <p className="venue-email__fallback">
        {formatRich(t("venue.email.fallback"), {
          link: <a className="venue-link" href={icsHref}>{t("venue.email.fallbackLink")}</a>,
        })}
      </p>
    </form>
  );
}
