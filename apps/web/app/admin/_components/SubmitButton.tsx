"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** Submit button for admin forms: disabled with a pending label while the action runs. */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "solid",
}: {
  children: ReactNode;
  pendingLabel: string;
  variant?: "solid" | "outline";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={variant === "outline" ? "admin-button admin-button--outline" : "admin-button"}
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
