"use client";

import { useReducer } from "react";
import type { FieldErrors } from "../../../lib/admin/forms";
import { initialNameFields, nameFieldsReducer } from "../../../lib/admin/name-fields";
import { Field } from "./Field";

interface NameFieldsProps {
  /** Unique id prefix within the page. */
  idPrefix: string;
  /** Form control names, e.g. `guestName`, `guestGivenName`, `guestFamilyName`. */
  names: { full: string; given: string; family: string };
  /** What the full name is of, for the label: "Guest name", "Name". */
  fullLabel: string;
  errors: FieldErrors;
  /** Stored values on an edit form; empty on a create form. */
  initial?: { full: string; given: string; family: string | null };
}

/**
 * Full name plus given and family name (#170). Given and family follow the
 * full name live with the contract's split heuristic until the admin edits
 * them. Remount (change `key`) to start over after a successful create.
 */
export function NameFields({ idPrefix, names, fullLabel, errors, initial }: NameFieldsProps) {
  const [state, dispatch] = useReducer(
    nameFieldsReducer,
    initial,
    (stored) => initialNameFields(stored?.full ?? "", stored?.given, stored?.family)
  );

  return (
    <>
      <Field
        id={`${idPrefix}-name`}
        name={names.full}
        label={fullLabel}
        required
        autoComplete="off"
        maxLength={120}
        hint="As it should appear in full, e.g. on the pass."
        value={state.full}
        onValueChange={(value) => dispatch({ type: "full", value })}
        error={errors[names.full]}
      />
      <div className="admin-name-split">
        <Field
          id={`${idPrefix}-given-name`}
          name={names.given}
          label="Given name"
          required={Boolean(initial)}
          autoComplete="off"
          maxLength={120}
          hint="What they are called, e.g. “An” for Nguyễn Văn An."
          value={state.given}
          onValueChange={(value) => dispatch({ type: "given", value })}
          error={errors[names.given]}
        />
        <Field
          id={`${idPrefix}-family-name`}
          name={names.family}
          label="Family name"
          autoComplete="off"
          maxLength={120}
          hint="Leave empty for a single name."
          value={state.family}
          onValueChange={(value) => dispatch({ type: "family", value })}
          error={errors[names.family]}
        />
      </div>
      <p className="admin-hint admin-name-note" aria-live="polite">
        {state.manual ? (
          <>
            Your own split is kept when the full name changes.{" "}
            <button type="button" className="admin-link-button" onClick={() => dispatch({ type: "resplit" })}>
              Split the full name again
            </button>
          </>
        ) : state.full.trim() ? (
          "Guessed from the full name: Vietnamese order when it starts with a common family name. Edit if wrong."
        ) : (
          "Filled in from the full name as you type."
        )}
      </p>
    </>
  );
}
