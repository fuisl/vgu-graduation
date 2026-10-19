"use client";

import type { Invitation } from "@grad/contract";
import { Cta } from "@grad/ui";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { sliceTranslator } from "../../../lib/i18n/format";
import type { RsvpFormState, RsvpMessages } from "../../../lib/invite/rsvp-form";
import type { SavedNeeds } from "../../../lib/invite/accessibility";
import { AccessibilitySection } from "./AccessibilitySection";
import { submitRsvp } from "./rsvp-actions";

export function RsvpForm({
  invitation,
  savedNeeds,
  messages,
  noteMaxLength,
}: {
  invitation: Invitation;
  savedNeeds: SavedNeeds;
  /** ACCESSIBILITY_NOTE_MAX_LENGTH, passed from the server so the contract (and zod) stay out of this bundle (QA P2-2). */
  noteMaxLength: number;
  /** `pickMessages(locale, ...RSVP_MESSAGES)`: the form's strings in the guest's language (#9). */
  messages: RsvpMessages;
}) {
  const t = sliceTranslator(messages);
  const { rsvp, maxPlusOnes } = invitation;
  const [attending, setAttending] = useState<"yes" | "no" | "">(rsvp ? (rsvp.attending ? "yes" : "no") : "");
  const [plusOnes, setPlusOnes] = useState(String(rsvp?.plusOnesCount ?? 0));
  const [dietary, setDietary] = useState(rsvp?.dietaryRequirements ?? "");
  const [notes, setNotes] = useState(rsvp?.notes ?? "");
  const [state, setState] = useState<RsvpFormState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const statusRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const submittedRef = useRef(false);

  // The fieldset is disabled while saving, which drops focus to <body>; once the answer is in,
  // move focus to what it says, so keyboard and screen-reader users land on it (QA P2-6).
  useEffect(() => {
    if (pending || !submittedRef.current) return;
    if (state.status === "error") errorRef.current?.focus();
    else if (state.status === "success") statusRef.current?.focus();
  }, [pending, state]);

  // Controlled inputs plus a manual submit keep every answer on screen after a failure
  // (a <form action> would reset the fields).
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    submittedRef.current = true;
    startTransition(async () => {
      try {
        setState(await submitRsvp(maxPlusOnes, data));
      } catch {
        setState({ status: "error", kind: "retry", message: t("rsvp.error.retry") });
      }
    });
  }

  const showPlusOnes = maxPlusOnes > 0 && attending === "yes";

  return (
    <form onSubmit={onSubmit} aria-busy={pending} aria-labelledby="rsvp-form-heading">
      <h2 id="rsvp-form-heading" className="invite-heading">{rsvp ? t("rsvp.form.change") : t("rsvp.form.respond")}</h2>
      <p>{t("rsvp.form.anyTime")}</p>

      <fieldset disabled={pending} className="invite-fieldset">
        <fieldset className="invite-field invite-choices">
          <legend className="invite-choices__legend">{t("rsvp.form.attendLegend")}</legend>
          <label className="invite-choice">
            <input
              type="radio"
              name="attending"
              value="yes"
              checked={attending === "yes"}
              onChange={() => setAttending("yes")}
              required
            />
            {t("rsvp.form.yes")}
          </label>
          <label className="invite-choice">
            <input
              type="radio"
              name="attending"
              value="no"
              checked={attending === "no"}
              onChange={() => setAttending("no")}
            />
            {t("rsvp.form.no")}
          </label>
        </fieldset>

        {showPlusOnes ? (
          <div className="invite-field">
            <label htmlFor="rsvp-plus-ones">{t("rsvp.form.plusOnes", { max: maxPlusOnes })}</label>
            <input
              id="rsvp-plus-ones"
              name="plusOnesCount"
              type="number"
              inputMode="numeric"
              min={0}
              max={maxPlusOnes}
              step={1}
              value={plusOnes}
              onChange={(e) => setPlusOnes(e.target.value)}
              className="invite-input"
            />
          </div>
        ) : null}

        {attending === "yes" ? (
          <div className="invite-field">
            <label htmlFor="rsvp-dietary">{t("rsvp.form.dietary")}</label>
            <input
              id="rsvp-dietary"
              name="dietaryRequirements"
              type="text"
              maxLength={500}
              value={dietary}
              onChange={(e) => setDietary(e.target.value)}
              className="invite-input"
            />
          </div>
        ) : null}

        {/* Not rendered for "No": nothing is submitted, so stored needs stay as they are. */}
        {attending === "yes" ? <AccessibilitySection saved={savedNeeds} messages={messages} noteMaxLength={noteMaxLength} /> : null}

        <div className="invite-field">
          <label htmlFor="rsvp-notes">{t("rsvp.form.notes")}</label>
          <textarea
            id="rsvp-notes"
            name="notes"
            rows={3}
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="invite-input"
          />
        </div>

        <div>
          <Cta tone="on-white" type="submit" disabled={pending}>
            {pending ? t("rsvp.form.saving") : state.status === "error" && state.kind === "retry" ? t("rsvp.form.retry") : t("rsvp.form.save")}
          </Cta>
        </div>
      </fieldset>

      <div ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="invite-status">
        {pending ? t("rsvp.form.savingStatus") : state.status === "success" ? state.message : null}
      </div>
      <div ref={errorRef} tabIndex={-1} role="alert" className="invite-error">
        {!pending && state.status === "error" ? state.message : null}
      </div>
    </form>
  );
}
