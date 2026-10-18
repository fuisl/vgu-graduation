"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** Submit button for admin forms: disabled with a pending label while the action runs. */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "solid",
  name,
  value,
  accessibleLabel,
}: {
  children: ReactNode;
  pendingLabel: string;
  variant?: "solid" | "outline";
  /** Submitted with the form, e.g. `intent`, to tell two submit buttons apart. */
  name?: string;
  value?: string;
  /** When the visible text is ambiguous out of context (e.g. many "Looks right" buttons). */
  accessibleLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={variant === "outline" ? "admin-button admin-button--outline" : "admin-button"}
      disabled={pending}
      aria-disabled={pending}
      name={name}
      value={value}
      aria-label={pending ? undefined : accessibleLabel}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
