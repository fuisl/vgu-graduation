"use client";

import { useActionState } from "react";
import { IDLE, type GraduateFormState } from "../../../lib/admin/action-state";
import { addGraduateAction } from "../actions";
import { Field, FormMessage, valueOf } from "./Field";
import { SubmitButton } from "./SubmitButton";

export function GraduateForm() {
  const [state, formAction] = useActionState<GraduateFormState, FormData>(addGraduateAction, IDLE);
  const errors = state.status === "error" ? state.errors : {};
  const values = state.status === "error" ? state.values : undefined;

  return (
    <form action={formAction} className="admin-form" noValidate aria-labelledby="add-graduate-heading">
      <h2 id="add-graduate-heading">Add a graduate</h2>
      {state.status === "error" && state.message ? <FormMessage kind="error">{state.message}</FormMessage> : null}
      {state.status === "success" ? <FormMessage kind="success">{state.message}</FormMessage> : null}
      <Field id="graduate-name" name="name" label="Name" required autoComplete="off" defaultValue={valueOf(values, "name")} error={errors.name} />
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
