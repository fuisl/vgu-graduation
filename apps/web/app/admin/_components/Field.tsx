import type { HTMLInputTypeAttribute } from "react";

interface FieldProps {
  /** Unique within the page; used for ids. */
  id: string;
  name: string;
  label: string;
  type?: HTMLInputTypeAttribute | "textarea";
  defaultValue?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  autoComplete?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  /** Controlled value, with `onValueChange`; otherwise the field is uncontrolled via `defaultValue`. */
  value?: string;
  onValueChange?: (value: string) => void;
}

/** Labelled input with its hint and error wired up through aria-describedby. */
export function Field({
  id,
  name,
  label,
  type = "text",
  defaultValue,
  error,
  hint,
  required,
  autoComplete,
  min,
  max,
  maxLength,
  value,
  onValueChange,
}: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const controlled =
    value === undefined
      ? { defaultValue }
      : {
          value,
          onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            onValueChange?.(event.target.value),
        };
  const common = {
    id,
    name,
    ...controlled,
    maxLength,
    required,
    autoComplete,
    className: "admin-input",
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
  } as const;

  return (
    <div className="admin-field">
      <label htmlFor={id}>
        {label}
        {required ? null : <span className="admin-muted"> (optional)</span>}
      </label>
      {hint ? (
        <p id={hintId} className="admin-hint">
          {hint}
        </p>
      ) : null}
      {type === "textarea" ? <textarea {...common} /> : <input {...common} type={type} min={min} max={max} />}
      {error ? (
        <p id={errorId} className="admin-field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Form-level error or success message. Errors are announced assertively. */
export function FormMessage({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  return (
    <div
      className={kind === "error" ? "admin-notice admin-notice--error" : "admin-notice"}
      role={kind === "error" ? "alert" : "status"}
    >
      <p>{children}</p>
    </div>
  );
}

/** Reads a string value echoed back by a failed submit. */
export function valueOf(values: Record<string, string | string[]> | undefined, name: string): string | undefined {
  const value = values?.[name];
  return typeof value === "string" ? value : undefined;
}
