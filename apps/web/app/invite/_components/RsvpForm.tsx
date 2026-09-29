"use client";

import type { Invitation } from "@grad/contract";
import { useState, useTransition, type FormEvent } from "react";
import { IDLE, RETRY_MESSAGE, type RsvpFormState } from "../../../lib/invite/rsvp-form";
import { submitRsvp } from "./rsvp-actions";

const fieldStyle = { display: "block", width: "100%", minHeight: 44, marginTop: 4, font: "inherit" } as const;
const groupStyle = { marginTop: "1rem" } as const;
const buttonStyle = {
  minHeight: 44,
  padding: "0 1rem",
  border: "1px solid var(--color-border-strong)",
  borderRadius: "var(--radius-sm)",
  background: "var(--fg)",
  color: "var(--bg)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
} as const;

export function RsvpForm({ invitation }: { invitation: Invitation }) {
  const { rsvp, maxPlusOnes } = invitation;
  const [attending, setAttending] = useState<"yes" | "no" | "">(rsvp ? (rsvp.attending ? "yes" : "no") : "");
  const [plusOnes, setPlusOnes] = useState(String(rsvp?.plusOnesCount ?? 0));
  const [dietary, setDietary] = useState(rsvp?.dietaryRequirements ?? "");
  const [notes, setNotes] = useState(rsvp?.notes ?? "");
  const [state, setState] = useState<RsvpFormState>(IDLE);
  const [pending, startTransition] = useTransition();

  // Controlled inputs plus a manual submit keep every answer on screen after a failure
  // (a <form action> would reset the fields).
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        setState(await submitRsvp(maxPlusOnes, data));
      } catch {
        setState({ status: "error", kind: "retry", message: RETRY_MESSAGE });
      }
    });
  }

  const showPlusOnes = maxPlusOnes > 0 && attending === "yes";

  return (
    <form onSubmit={onSubmit} aria-busy={pending} aria-labelledby="rsvp-form-heading">
      <h2 id="rsvp-form-heading">{rsvp ? "Change your RSVP" : "Respond to the invitation"}</h2>
      <p>You can change your answer at any time.</p>

      <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0 }}>
        <div role="radiogroup" aria-labelledby="rsvp-attending-label" style={groupStyle}>
          <p id="rsvp-attending-label">Will you attend?</p>
          <label>
            <input
              type="radio"
              name="attending"
              value="yes"
              checked={attending === "yes"}
              onChange={() => setAttending("yes")}
              required
            />{" "}
            Yes, I will attend
          </label>
          <br />
          <label>
            <input
              type="radio"
              name="attending"
              value="no"
              checked={attending === "no"}
              onChange={() => setAttending("no")}
            />{" "}
            No, I cannot attend
          </label>
        </div>

        {showPlusOnes ? (
          <div style={groupStyle}>
            <label htmlFor="rsvp-plus-ones">Guests you are bringing (0 to {maxPlusOnes})</label>
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
              style={fieldStyle}
            />
          </div>
        ) : null}

        {attending === "yes" ? (
          <div style={groupStyle}>
            <label htmlFor="rsvp-dietary">Dietary requirements (optional)</label>
            <input
              id="rsvp-dietary"
              name="dietaryRequirements"
              type="text"
              maxLength={500}
              value={dietary}
              onChange={(e) => setDietary(e.target.value)}
              style={fieldStyle}
            />
          </div>
        ) : null}

        <div style={groupStyle}>
          <label htmlFor="rsvp-notes">Notes (optional)</label>
          <textarea
            id="rsvp-notes"
            name="notes"
            rows={3}
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={fieldStyle}
          />
        </div>

        <div style={groupStyle}>
          <button type="submit" disabled={pending} style={buttonStyle}>
            {pending ? "Saving..." : state.status === "error" && state.kind === "retry" ? "Try again" : "Save RSVP"}
          </button>
        </div>
      </fieldset>

      <div role="status" aria-live="polite" style={groupStyle}>
        {pending ? "Saving your RSVP..." : state.status === "success" ? state.message : null}
      </div>
      <div role="alert" style={groupStyle}>
        {!pending && state.status === "error" ? state.message : null}
      </div>
    </form>
  );
}
