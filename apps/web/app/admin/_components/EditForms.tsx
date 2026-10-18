"use client";

import { useActionState } from "react";
import { IDLE, INITIAL_PREFIX, type EditFormState } from "../../../lib/admin/action-state";
import { updateGraduateAction, updateInvitationAction } from "../name-actions";
import { Field, FormMessage, valueOf } from "./Field";
import { NameFields } from "./NameFields";
import { SubmitButton } from "./SubmitButton";

/**
 * Edit forms for an existing graduate or invitation (#170). Each carries the
 * values it was rendered with as hidden `initial.*` inputs, so the action
 * sends only what changed (lib/admin/forms.ts). Those values are already on
 * the page; they never go into a URL.
 */

function Initial({ values }: { values: Record<string, string> }) {
  return (
    <>
      {Object.entries(values).map(([name, value]) => (
        <input key={name} type="hidden" name={`${INITIAL_PREFIX}${name}`} value={value} />
      ))}
    </>
  );
}

function useEditState(action: (state: EditFormState, form: FormData) => Promise<EditFormState>) {
  const [state, formAction] = useActionState<EditFormState, FormData>(action, IDLE);
  return {
    state,
    formAction,
    errors: state.status === "error" ? state.errors : {},
    values: state.status === "error" ? state.values : undefined,
  };
}

function Messages({ state }: { state: EditFormState }) {
  if (state.status === "error" && state.message) return <FormMessage kind="error">{state.message}</FormMessage>;
  if (state.status === "saved") return <FormMessage kind="success">{state.message}</FormMessage>;
  return null;
}

export interface GraduateEditValues {
  id: string;
  name: string;
  givenName: string;
  familyName: string | null;
  email: string;
  nameReviewed: boolean;
}

export function GraduateEditForm({ graduate }: { graduate: GraduateEditValues }) {
  const { state, formAction, errors, values } = useEditState(updateGraduateAction);
  return (
    <form action={formAction} className="admin-form" noValidate aria-labelledby="edit-graduate-heading">
      <h2 id="edit-graduate-heading">Edit details</h2>
      <Messages state={state} />
      <input type="hidden" name="id" value={graduate.id} />
      <Initial
        values={{
          name: graduate.name,
          givenName: graduate.givenName,
          familyName: graduate.familyName ?? "",
          email: graduate.email,
          nameReviewed: String(graduate.nameReviewed),
        }}
      />
      <NameFields
        idPrefix="edit-graduate"
        names={{ full: "name", given: "givenName", family: "familyName" }}
        fullLabel="Name"
        errors={errors}
        initial={{ full: graduate.name, given: graduate.givenName, family: graduate.familyName }}
      />
      <Field
        id="edit-graduate-email"
        name="email"
        label="Email"
        type="email"
        required
        autoComplete="off"
        defaultValue={valueOf(values, "email") ?? graduate.email}
        error={errors.email}
      />
      <SubmitButton pendingLabel="Saving…">{graduate.nameReviewed ? "Save changes" : "Save and confirm name"}</SubmitButton>
    </form>
  );
}

export interface InvitationEditValues {
  id: string;
  guestName: string;
  guestGivenName: string;
  guestFamilyName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  maxPlusOnes: number;
  nameReviewed: boolean;
  /** Plus-ones the guest already confirmed: the lowest allowed maximum. */
  confirmedPlusOnes: number;
}

export function InvitationEditForm({ invitation }: { invitation: InvitationEditValues }) {
  const { state, formAction, errors, values } = useEditState(updateInvitationAction);
  return (
    <form action={formAction} className="admin-form" noValidate aria-labelledby="edit-invitation-heading">
      <h2 id="edit-invitation-heading">Edit guest details</h2>
      <Messages state={state} />
      <input type="hidden" name="id" value={invitation.id} />
      <Initial
        values={{
          guestName: invitation.guestName,
          guestGivenName: invitation.guestGivenName,
          guestFamilyName: invitation.guestFamilyName ?? "",
          guestEmail: invitation.guestEmail ?? "",
          guestPhone: invitation.guestPhone ?? "",
          maxPlusOnes: String(invitation.maxPlusOnes),
          nameReviewed: String(invitation.nameReviewed),
        }}
      />
      <NameFields
        idPrefix="edit-invitation-guest"
        names={{ full: "guestName", given: "guestGivenName", family: "guestFamilyName" }}
        fullLabel="Guest name"
        errors={errors}
        initial={{ full: invitation.guestName, given: invitation.guestGivenName, family: invitation.guestFamilyName }}
      />
      <Field
        id="edit-invitation-guest-email"
        name="guestEmail"
        label="Guest email"
        type="email"
        autoComplete="off"
        hint="Clear it to remove the email."
        defaultValue={valueOf(values, "guestEmail") ?? invitation.guestEmail ?? ""}
        error={errors.guestEmail}
      />
      <Field
        id="edit-invitation-guest-phone"
        name="guestPhone"
        label="Guest phone"
        type="tel"
        autoComplete="off"
        maxLength={40}
        defaultValue={valueOf(values, "guestPhone") ?? invitation.guestPhone ?? ""}
        error={errors.guestPhone}
      />
      <Field
        id="edit-invitation-max-plus-ones"
        name="maxPlusOnes"
        label="Maximum plus-ones"
        type="number"
        min={invitation.confirmedPlusOnes}
        max={20}
        required
        hint={
          invitation.confirmedPlusOnes > 0
            ? `The guest already confirmed ${invitation.confirmedPlusOnes}, so it can't go lower.`
            : undefined
        }
        defaultValue={valueOf(values, "maxPlusOnes") ?? String(invitation.maxPlusOnes)}
        error={errors.maxPlusOnes}
      />
      <SubmitButton pendingLabel="Saving…">
        {invitation.nameReviewed ? "Save changes" : "Save and confirm name"}
      </SubmitButton>
    </form>
  );
}
