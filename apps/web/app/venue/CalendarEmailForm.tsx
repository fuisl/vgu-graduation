"use client";

import { useId, useState, type FormEvent } from "react";
import { Cta, PaperPlanePixel } from "@grad/ui";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = { kind: "idle" } | { kind: "invalid" } | { kind: "pending" };

/**
 * Calendar invite by email (#150). The invite email is not built yet, so this is the front end
 * only: it validates the address and says plainly that sending has not started. It never
 * stores, logs or transmits the address. When the email exists, submit to its endpoint here
 * and replace the "pending" copy with a sent confirmation.
 */
export function CalendarEmailForm({ icsHref }: { icsHref: string }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(EMAIL.test(email.trim()) ? { kind: "pending" } : { kind: "invalid" });
  }

  return (
    <form className="venue-email" onSubmit={onSubmit} noValidate aria-describedby={`${id}-status`}>
      <label className="venue-label" htmlFor={`${id}-email`}>Get the calendar invite by email</label>
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
        <Cta tone="on-blue" type="submit" icon={<PaperPlanePixel />}>Send invite</Cta>
      </div>
      <p id={`${id}-status`} className="venue-email__status" role="status">
        {status.kind === "invalid" ? "Enter an email address like name@example.com." : null}
        {status.kind === "pending" ? "Email invites are not sending yet. Use the calendar file below for now." : null}
      </p>
      <p className="venue-email__fallback">
        Or <a className="venue-link" href={icsHref}>download the calendar file (.ics)</a>
      </p>
    </form>
  );
}
