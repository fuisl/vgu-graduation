import type { EmailStatus, EventConfig } from "@grad/contract";
import type { FieldErrors } from "./forms";

/** Submitted values echoed back after a failed submit so the form keeps them (React resets forms after an action). */
export type FormValues = Record<string, string | string[]>;

export type FormError = {
  status: "error";
  /** Form-level message (network failure, API error). */
  message?: string;
  errors: FieldErrors;
  values: FormValues;
};

export type Idle = { status: "idle" };

export type GraduateFormState = Idle | FormError | { status: "success"; message: string };

/**
 * `inviteUrl` is the bearer credential, returned by the API exactly once. It
 * lives only in this in-memory action state: never in the URL, a cookie,
 * storage or a log.
 */
export type InvitationFormState =
  | Idle
  | FormError
  | { status: "created"; invitationId: string; guestName: string; inviteUrl: string; emailStatus?: EmailStatus };

/** Edit forms for an existing graduate or invitation, and guide-book items (#170, #140). */
export type EditFormState = Idle | FormError | { status: "saved"; message: string };

/** One-tap actions: "Looks right" on a name, show/hide or delete a guide item, save guide-book picks. */
export type QuickActionState = Idle | { status: "error"; message: string } | { status: "done"; message: string };

export type InvitationActionState =
  | Idle
  | { status: "error"; message: string }
  | { status: "rotated"; inviteUrl: string; emailStatus?: EmailStatus }
  | { status: "revoked" };

/** Approve, reject or revoke one admin account (#119). */
export type AdminAccountActionState = Idle | { status: "error"; message: string } | { status: "done"; message: string };

export type EventFormState = Idle | FormError | { status: "saved"; event: EventConfig };

export const IDLE: Idle = { status: "idle" };

/** Prefix of the hidden inputs that carry the values an edit form was rendered with (lib/admin/forms.ts). */
export const INITIAL_PREFIX = "initial.";

/** Collects the submitted string values, skipping Next's internal `$ACTION_*` fields. */
export function formValues(form: FormData): FormValues {
  const values: FormValues = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith("$ACTION") || typeof value !== "string") continue;
    const existing = values[key];
    if (existing === undefined) values[key] = value;
    else values[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  return values;
}
