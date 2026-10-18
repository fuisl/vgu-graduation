"use client";

import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import { requestPrintAction } from "../queue-actions";

const COPIES = [1, 2, 3, 4, 5] as const;

type State = { status: "idle" } | { status: "sending" } | { status: "queued"; copies: number } | { status: "error"; message: string };

/**
 * "Print…" on a visible, processed photo (#74, experimental): pick 1 to 5
 * copies and queue a job. The printer daemon at the venue picks it up; if it
 * is away the job simply waits in the queue (/admin/print). Behind a
 * <details> step so a stray tap never prints.
 */
export function PrintRequest({ publicId }: { publicId: string }) {
  const [copies, setCopies] = useState(1);
  const [state, setState] = useState<State>({ status: "idle" });
  const details = useRef<HTMLDetailsElement>(null);
  const name = useId();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status === "sending") return;
    setState({ status: "sending" });
    let result: Awaited<ReturnType<typeof requestPrintAction>> | undefined;
    try {
      result = await requestPrintAction(publicId, copies);
    } catch {
      result = undefined;
    }
    if (result?.ok) {
      setState({ status: "queued", copies: result.data.copies });
      details.current?.removeAttribute("open");
      details.current?.querySelector("summary")?.focus();
    } else {
      setState({ status: "error", message: result?.message ?? "Could not reach the server. Try again." });
    }
  }

  return (
    <div className="admin-print">
      <details className="admin-details" ref={details}>
        <summary className="admin-button admin-button--outline">Print…</summary>
        <form onSubmit={submit}>
          <fieldset className="admin-fieldset">
            <legend>Copies</legend>
            <div className="admin-segment">
              {COPIES.map((count) => (
                <label key={count} className="admin-segment__button">
                  <input
                    type="radio"
                    name={name}
                    value={count}
                    checked={copies === count}
                    onChange={() => setCopies(count)}
                    className="sr-only"
                  />
                  {count}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="admin-actions">
            <button
              type="submit"
              className="admin-button"
              disabled={state.status === "sending"}
              aria-disabled={state.status === "sending"}
            >
              {state.status === "sending" ? "Queueing…" : `Queue ${copies} ${copies === 1 ? "print" : "prints"}`}
            </button>
          </div>
        </form>
      </details>
      <div aria-live="polite">
        {state.status === "queued" ? (
          <p className="admin-hint">
            Queued {state.copies} {state.copies === 1 ? "copy" : "copies"}. <Link href="/admin/print">Print queue</Link>
          </p>
        ) : null}
      </div>
      {state.status === "error" ? (
        <p role="alert" className="admin-field-error">
          Print not queued: {state.message}
        </p>
      ) : null}
    </div>
  );
}
