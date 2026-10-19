"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Cta } from "@grad/ui";
import { formatRich } from "../../../lib/i18n/format";
import type { MessageKeys, SliceTranslator } from "../../../lib/i18n/format";
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
export function PrintRequest({
  publicId,
  availability,
  t,
}: {
  publicId: string;
  availability: PrintAvailability | null;
  /** The gallery's translator; this component reads only `print.*` (#9). */
  t: SliceTranslator<MessageKeys<"print.">>;
}) {
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
          {formatRich(t("print.signedOut"), {
            link: <Link className="gal-print-link" href="/invite">{t("print.signedOutLink")}</Link>,
          })}
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
        message: printErrorMessage(response.status, retryAfter, availability.perHour, t),
        canRetry: response.status >= 500,
      });
    } catch {
      go({ step: "error", message: printErrorMessage(0, undefined, availability.perHour, t), canRetry: true });
    }
  };

  return (
    <div className="gal-print" ref={rootRef}>
      {state.step === "idle" ? (
        <Cta tone="on-white" variant="secondary" onClick={() => go({ step: "confirm" })}>{t("print.request")}</Cta>
      ) : null}

      {state.step === "confirm" || state.step === "sending" ? (
        <div className="gal-print-confirm" role="group" aria-labelledby={`print-confirm-${publicId}`}>
          <p id={`print-confirm-${publicId}`} className="gal-print-text">
            {t("print.confirmText", { perHour: availability.perHour })}
          </p>
          <div className="gal-print-actions">
            <Cta tone="on-white" onClick={() => void submit()} disabled={state.step === "sending"}>
              {state.step === "sending" ? t("print.sending") : t("print.confirm")}
            </Cta>
            <Cta tone="on-white" variant="secondary" onClick={() => go({ step: "idle" })} disabled={state.step === "sending"}>
              {t("print.cancel")}
            </Cta>
          </div>
          <p className="brand-sr-only" role="status">{state.step === "sending" ? t("print.sendingStatus") : ""}</p>
        </div>
      ) : null}

      {state.step === "done" ? (
        <p className="mem-status mem-status--success" role="status" tabIndex={-1} data-print-message>
          {/* TODO(owner): name where guests collect prints (e.g. "the photo desk by the hall entrance"). */}
          {t("print.done")}
        </p>
      ) : null}

      {state.step === "error" ? (
        <div className="gal-print-confirm">
          <p className="mem-status mem-status--error" role="alert" tabIndex={-1} data-print-message>{state.message}</p>
          {state.canRetry ? (
            <div className="gal-print-actions">
              <Cta tone="on-white" variant="secondary" onClick={() => go({ step: "confirm" })}>{t("print.retry")}</Cta>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
