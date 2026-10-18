"use client";

import { ACCESSIBILITY_NOTE_MAX_LENGTH, type AccessibilityNeedKey, type AccessibilityNeeds } from "@grad/contract";
import { useState } from "react";
import {
  A11Y_NOTE_FIELD,
  A11Y_TOUCHED_FIELD,
  ACCESSIBILITY_GROUPS,
  NO_NEEDS,
  a11yFieldName,
  countNeeds,
  type SavedNeeds,
} from "../../../lib/invite/accessibility";

/**
 * Optional "Accessibility and assistance" part of the RSVP form (#176), collapsed unless the guest
 * already told us something. It only submits `accessibilityTouched=1` once the guest changes it, so
 * an untouched section (or one whose saved needs could not be loaded) never overwrites stored needs.
 */
export function AccessibilitySection({ saved }: { saved: SavedNeeds }) {
  const initial = saved.status === "ok" && saved.needs ? saved.needs : NO_NEEDS;
  const [needs, setNeeds] = useState<AccessibilityNeeds>(initial);
  const [touched, setTouched] = useState(false);
  const stored = countNeeds(saved.status === "ok" ? saved.needs : null);

  function toggle(key: AccessibilityNeedKey, value: boolean) {
    setNeeds((current) => ({ ...current, [key]: value }));
    setTouched(true);
  }

  return (
    <details className="invite-assist" id="accessibility" open={stored > 0}>
      <summary className="invite-assist__summary">
        <span className="invite-assist__title">Accessibility and assistance</span>
        <span className="invite-assist__hint">
          {stored > 0 ? `Optional · ${stored} ${stored === 1 ? "detail" : "details"} saved` : "Optional"}
        </span>
      </summary>
      <div className="invite-assist__body">
        <p className="invite-assist__privacy">
          Tell us what would make the day easier and we will plan for it. Only the organizers see this, and it is
          deleted after the event. You can change or remove it here at any time.
        </p>
        {saved.status === "unavailable" ? (
          <p className="invite-assist__notice" role="status">
            We could not load what you told us before. It is kept as it is unless you change something here.
          </p>
        ) : null}
        <input type="hidden" name={A11Y_TOUCHED_FIELD} value={touched ? "1" : ""} />
        {ACCESSIBILITY_GROUPS.map((group) => (
          <fieldset key={group.legend} className="invite-assist__group">
            <legend className="invite-assist__legend">{group.legend}</legend>
            {group.needs.map((need) => (
              <label key={need.key} className="invite-check">
                <input
                  type="checkbox"
                  name={a11yFieldName(need.key)}
                  checked={needs[need.key]}
                  onChange={(event) => toggle(need.key, event.target.checked)}
                />
                <span>{need.label}</span>
              </label>
            ))}
          </fieldset>
        ))}
        <div className="invite-field">
          <label htmlFor="rsvp-a11y-note">Anything else we should know (optional)</label>
          <textarea
            id="rsvp-a11y-note"
            name={A11Y_NOTE_FIELD}
            rows={3}
            maxLength={ACCESSIBILITY_NOTE_MAX_LENGTH}
            aria-describedby="rsvp-a11y-note-hint"
            value={needs.note ?? ""}
            onChange={(event) => {
              setNeeds((current) => ({ ...current, note: event.target.value }));
              setTouched(true);
            }}
            className="invite-input"
          />
          <p id="rsvp-a11y-note-hint" className="invite-hint">
            Up to {ACCESSIBILITY_NOTE_MAX_LENGTH} characters. To remove everything, untick the boxes, clear this note
            and save.
          </p>
        </div>
        <p className="invite-assist__more">
          <a className="invite-link" href="/accessibility">How we help on the day</a>
        </p>
      </div>
    </details>
  );
}
