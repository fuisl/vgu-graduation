"use client";

import { useActionState, useEffect, useState } from "react";
import { IDLE, type GraduateFormState } from "../../../lib/admin/action-state";
import { addGraduateAction } from "../actions";
import { Field, FormMessage, valueOf } from "./Field";
import { NameFields } from "./NameFields";
import { SubmitButton } from "./SubmitButton";

export function GraduateForm() {
  const [state, formAction] = useActionState<GraduateFormState, FormData>(addGraduateAction, IDLE);
  // The name fields are controlled, so React's post-action form reset does not clear them: remount instead.
  const [resets, setResets] = useState(0);
  useEffect(() => {
    if (state.status === "success") setResets((count) => count + 1);
  }, [state]);
  const errors = state.status === "error" ? state.errors : {};
  const values = state.status === "error" ? state.values : undefined;

  return (
    <form action={formAction} className="admin-form" noValidate aria-labelledby="add-graduate-heading">
      <h2 id="add-graduate-heading">Add a graduate</h2>
      {state.status === "error" && state.message ? <FormMessage kind="error">{state.message}</FormMessage> : null}
      {state.status === "success" ? <FormMessage kind="success">{state.message}</FormMessage> : null}
      <NameFields
        key={resets}
        idPrefix="graduate"
        names={{ full: "name", given: "givenName", family: "familyName" }}
        fullLabel="Name"
        errors={errors}
      />
      <Field
        id="graduate-email"
        name="email"
        label="Email"
        type="email"
        required
        autoComplete="off"
        defaultValue={valueOf(values, "email")}
        error={errors.email}
      />
      <SubmitButton pendingLabel="Adding…">Add graduate</SubmitButton>
    </form>
  );
}
