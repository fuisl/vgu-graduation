"use client";

import type { Graduate } from "@grad/contract";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { IDLE, type InvitationFormState } from "../../../lib/admin/action-state";
import { createInvitationAction } from "../actions";
import { Field, FormMessage, valueOf } from "./Field";
import { InviteLinkNotice } from "./InviteLinkNotice";
import { NameFields } from "./NameFields";
import { SubmitButton } from "./SubmitButton";

export function InvitationForm({ graduates }: { graduates: Pick<Graduate, "id" | "name" | "email">[] }) {
  const [state, formAction] = useActionState<InvitationFormState, FormData>(createInvitationAction, IDLE);
  // Hiding the link is local-only; the action state object identifies which result was dismissed.
  const [dismissed, setDismissed] = useState<InvitationFormState | null>(null);
  // The name fields are controlled, so React's post-action form reset does not clear them: remount instead.
  const [resets, setResets] = useState(0);
  useEffect(() => {
    if (state.status === "created") setResets((count) => count + 1);
  }, [state]);
  const errors = state.status === "error" ? state.errors : {};
  const values = state.status === "error" ? state.values : undefined;
  const selected = new Set([values?.inviterUserIds ?? []].flat());
  const inviterErrorId = errors.inviterUserIds ? "invitation-inviters-error" : undefined;

  return (
    <>
      {state.status === "created" && dismissed !== state ? (
        <InviteLinkNotice
          title={`Invitation created for ${state.guestName}`}
          inviteUrl={state.inviteUrl}
          emailStatus={state.emailStatus}
          onDismiss={() => setDismissed(state)}
        />
      ) : null}
      {state.status === "created" ? (
        <p>
          Next, after copying the link:{" "}
          <Link href={`/admin/invitations/${state.invitationId}`} prefetch={false}>
            pick guide-book places for {state.guestName}
          </Link>{" "}
          (optional; guests see the defaults otherwise).
        </p>
      ) : null}
      <form action={formAction} className="admin-form" noValidate aria-labelledby="create-invitation-heading">
        <h2 id="create-invitation-heading">Create an invitation</h2>
        {state.status === "error" && state.message ? <FormMessage kind="error">{state.message}</FormMessage> : null}
        <NameFields
          key={resets}
          idPrefix="invitation-guest"
          names={{ full: "guestName", given: "guestGivenName", family: "guestFamilyName" }}
          fullLabel="Guest name"
          errors={errors}
        />
        <Field
          id="invitation-guest-email"
          name="guestEmail"
          label="Guest email"
          type="email"
          autoComplete="off"
          defaultValue={valueOf(values, "guestEmail")}
          error={errors.guestEmail}
        />
        <label className="admin-check">
          <input type="checkbox" name="sendEmail" defaultChecked={valueOf(values, "sendEmail") === "on"} />
          <span>
            Email the link to the guest <span className="admin-muted">(sent from the event&apos;s Gmail account)</span>
          </span>
        </label>
        <Field
          id="invitation-guest-phone"
          name="guestPhone"
          label="Guest phone"
          type="tel"
          autoComplete="off"
          defaultValue={valueOf(values, "guestPhone")}
          error={errors.guestPhone}
        />
        <fieldset
          className="admin-fieldset"
          aria-describedby={inviterErrorId}
          aria-invalid={errors.inviterUserIds ? true : undefined}
        >
          <legend>Invited by (choose one or more graduates)</legend>
          {graduates.map((graduate) => (
            <label key={graduate.id} className="admin-check">
              <input
                type="checkbox"
                name="inviterUserIds"
                value={graduate.id}
                defaultChecked={selected.has(graduate.id)}
              />
              <span>
                {graduate.name} <span className="admin-muted">{graduate.email}</span>
              </span>
            </label>
          ))}
          {errors.inviterUserIds ? (
            <p id={inviterErrorId} className="admin-field-error">
              {errors.inviterUserIds}
            </p>
          ) : null}
        </fieldset>
        <Field
          id="invitation-max-plus-ones"
          name="maxPlusOnes"
          label="Maximum plus-ones"
          type="number"
          min={0}
          required
          defaultValue={valueOf(values, "maxPlusOnes") ?? "0"}
          error={errors.maxPlusOnes}
        />
        <SubmitButton pendingLabel="Creating…">Create invitation</SubmitButton>
      </form>
    </>
  );
}
