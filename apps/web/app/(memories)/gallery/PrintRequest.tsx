"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Cta } from "@grad/ui";
import { printErrorMessage } from "../../../lib/print/messages";

/** GET /api/print: whether the guest print action applies to this visitor (#74). */
export type PrintAvailability = { enabled: boolean; signedIn: boolean; perHour: number };

/** Asks the BFF once per gallery visit. Any failure hides the action: printing is experimental and never blocks the gallery. */
export function usePrintAvailability(): PrintAvailability | null {
  const [availability, setAvailability] = useState<PrintAvailability | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/print", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        if (
          body &&
          typeof body === "object" &&
          "enabled" in body &&
          "signedIn" in body &&
          "perHour" in body &&
          typeof body.enabled === "boolean" &&
          typeof body.signedIn === "boolean" &&
          typeof body.perHour === "number"
        ) {
          setAvailability({ enabled: body.enabled, signedIn: body.signedIn, perHour: body.perHour });
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return availability;
}

type State =
  | { step: "idle" }
  | { step: "confirm" }
  | { step: "sending" }
  | { step: "done" }
  | { step: "error"; message: string; canRetry: boolean };

/**
 * "Request a print" for one photo in the gallery dialog: a confirmation step,
 * then POST /api/print (the BFF forwards the HttpOnly invitation cookie as the
 * credential). Focus moves with the step so keyboard and screen-reader users
 * never land on a removed button.
 */
export function PrintRequest({ publicId, availability }: { publicId: string; availability: PrintAvailability | null }) {
  const [state, setState] = useState<State>({ step: "idle" });
  const rootRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  // After a step change, focus its main control (or its message).
  useEffect(() => {
    if (!moved.current) return;
    const root = rootRef.current;
    if (!root) return;
    const target =
      state.step === "done" || state.step === "error"
        ? root.querySelector<HTMLElement>("[data-print-message]")
        : root.querySelector<HTMLElement>("button:not([disabled])");
    target?.focus();
  }, [state.step]);

  if (!availability?.enabled) return null;

  if (!availability.signedIn) {
    return (
      <div className="gal-print">
        <p className="mem-help">
          Guests can request a print of this photo at the venue. <Link className="gal-print-link" href="/invite">Open your invitation</Link> first.
        </p>
      </div>
    );
  }

  const go = (next: State) => {
    moved.current = true;
    setState(next);
  };

  const submit = async () => {
    go({ step: "sending" });
    try {
      const response = await fetch("/api/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoPublicId: publicId }),
      });
      if (response.status === 201) {
        go({ step: "done" });
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      const retryAfter =
        body && typeof body === "object" && "retryAfterSeconds" in body && typeof body.retryAfterSeconds === "number"
          ? body.retryAfterSeconds
          : Number(response.headers.get("Retry-After")) || undefined;
      go({
        step: "error",
        message: printErrorMessage(response.status, retryAfter, availability.perHour),
        canRetry: response.status >= 500,
      });
    } catch {
      go({ step: "error", message: printErrorMessage(0, undefined, availability.perHour), canRetry: true });
    }
  };

  return (
    <div className="gal-print" ref={rootRef}>
      {state.step === "idle" ? (
        <Cta tone="on-white" variant="secondary" onClick={() => go({ step: "confirm" })}>Request a print</Cta>
      ) : null}

      {state.step === "confirm" || state.step === "sending" ? (
        <div className="gal-print-confirm" role="group" aria-labelledby={`print-confirm-${publicId}`}>
          <p id={`print-confirm-${publicId}`} className="gal-print-text">
            Print one copy of this photo at the venue? Each invitation can request {availability.perHour} prints an hour.
          </p>
          <div className="gal-print-actions">
            <Cta tone="on-white" onClick={() => void submit()} disabled={state.step === "sending"}>
              {state.step === "sending" ? "Sending…" : "Confirm print"}
            </Cta>
            <Cta tone="on-white" variant="secondary" onClick={() => go({ step: "idle" })} disabled={state.step === "sending"}>
              Cancel
            </Cta>
          </div>
          <p className="brand-sr-only" role="status">{state.step === "sending" ? "Sending your print request" : ""}</p>
        </div>
      ) : null}

      {state.step === "done" ? (
        <p className="mem-status mem-status--success" role="status" tabIndex={-1} data-print-message>
          {/* TODO(owner): name where guests collect prints (e.g. "the photo desk by the hall entrance"). */}
          Your print is in the queue. Collect it at the photo desk.
        </p>
      ) : null}

      {state.step === "error" ? (
        <div className="gal-print-confirm">
          <p className="mem-status mem-status--error" role="alert" tabIndex={-1} data-print-message>{state.message}</p>
          {state.canRetry ? (
            <div className="gal-print-actions">
              <Cta tone="on-white" variant="secondary" onClick={() => go({ step: "confirm" })}>Try again</Cta>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
