"use client";

import { DEFAULT_PRINT_LAYOUT, PRINT_CAPTION_MAX, PRINT_LAYOUT_LABELS, printLayoutSchema, type PrintLayout } from "@grad/contract";
import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import { printOptionsFromForm, printOptionTags } from "../../../lib/admin/print-queue";
import { requestPrintAction } from "../queue-actions";

const COPIES = [1, 2, 3, 4, 5] as const;
const LAYOUTS = printLayoutSchema.options;

type State =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "queued"; copies: number; tags: string[] }
  | { status: "error"; message: string };

/**
 * "Print…" on a visible, processed photo (#74, experimental): pick 1 to 5
 * copies, the thermal photobooth's layout (Polaroid by default), the ASCII
 * filter and an optional caption, and queue a job. The printer daemon at the
 * venue picks it up; if it is away the job simply waits in the queue
 * (/admin/print). Behind a <details> step so a stray tap never prints.
 */
export function PrintRequest({ publicId }: { publicId: string }) {
  const [copies, setCopies] = useState(1);
  const [layout, setLayout] = useState<PrintLayout>(DEFAULT_PRINT_LAYOUT);
  const [ascii, setAscii] = useState(false);
  const [caption, setCaption] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const details = useRef<HTMLDetailsElement>(null);
  const name = useId();
  const id = useId();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status === "sending") return;
    setState({ status: "sending" });
    const options = printOptionsFromForm(layout, ascii, caption);
    let result: Awaited<ReturnType<typeof requestPrintAction>> | undefined;
    try {
      result = await requestPrintAction(publicId, copies, options);
    } catch {
      result = undefined;
    }
    if (result?.ok) {
      setState({ status: "queued", copies: result.data.copies, tags: printOptionTags(options) });
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
          <div className="admin-field">
            <label htmlFor={`${id}-layout`}>Layout</label>
            <select
              id={`${id}-layout`}
              className="admin-input"
              value={layout}
              onChange={(event) => setLayout(printLayoutSchema.parse(event.target.value))}
              aria-describedby={`${id}-hint`}
            >
              {LAYOUTS.map((option) => (
                <option key={option} value={option}>
                  {PRINT_LAYOUT_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
          <label className="admin-check">
            <input type="checkbox" checked={ascii} onChange={(event) => setAscii(event.target.checked)} />
            ASCII
          </label>
          <div className="admin-field">
            <label htmlFor={`${id}-caption`}>Caption (optional)</label>
            <input
              id={`${id}-caption`}
              className="admin-input"
              type="text"
              value={caption}
              maxLength={PRINT_CAPTION_MAX}
              autoComplete="off"
              onChange={(event) => setCaption(event.target.value)}
              aria-describedby={`${id}-hint`}
            />
          </div>
          <p id={`${id}-hint`} className="admin-hint">
            Layout, ASCII and caption are for the thermal photobooth printer. An empty caption prints the default.
          </p>
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
            Queued {state.copies} {state.copies === 1 ? "copy" : "copies"}
            {state.tags.length > 0 ? ` (${state.tags.join(", ")})` : ""}. <Link href="/admin/print">Print queue</Link>
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
