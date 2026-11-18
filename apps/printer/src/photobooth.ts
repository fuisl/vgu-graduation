import { readFile } from "node:fs/promises";
import type { PrintLayout } from "@grad/contract";
import { Agent, FormData, fetch as undiciFetch, type Dispatcher } from "undici";
import { silentLogger, summarize, type Logger } from "./log.js";
import { PrintNotSentError, type Printer, type PrintRequest } from "./printer.js";

/*
 * PRINT_MODE=photobooth: hands each job to the venue's "Receipt Photobooth", a
 * separate local app (Python/FastAPI) that drives the 80 mm thermal printer.
 * One POST /api/tickets per copy (the booth has no copies parameter), with
 * do_print=true; the booth composes the layout and prints before it answers:
 *
 *   201 { token, serial, layout, ..., print: { printed: true, ... } }   printed
 *   201 { ..., print: { printed: false, dry_run: true } }               booth runs without a printer
 *   201 { ..., print: { printed: false, error: "printing stopped after N of M dot rows ..." } }
 *   400 { detail }  composition error (bad layout, unreadable photo)
 *
 * The booth's response carries its own keepsake token and share URL; neither is
 * logged or kept. No guest name or email is sent.
 */

export interface PhotoboothSettings {
  /** Base URL without a trailing slash, e.g. https://localhost:8000. */
  url: string;
  insecureTls: boolean;
  defaultLayout: PrintLayout;
  caption: string;
  includeQr: boolean;
  includeQuote: boolean;
  timeoutMs: number;
}

/** The subset of fetch the booth client uses; tests pass a fake. */
export type BoothFetch = (
  url: string,
  init: { method: string; body?: FormData; signal: AbortSignal; dispatcher?: Dispatcher },
) => Promise<Pick<Response, "status" | "ok" | "text">>;

/** Error codes that mean the request never reached the booth: safe to send again. */
const NOT_SENT_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "EHOSTDOWN",
  "ENETUNREACH",
  "ENETDOWN",
  "UND_ERR_CONNECT_TIMEOUT",
]);
/** TLS handshake failures: also before anything was sent. */
const TLS_CODES = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "CERT_HAS_EXPIRED",
]);

/** The first `code` along an error's cause chain (undici wraps socket errors in `TypeError: fetch failed`). */
function errorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Turns a failed fetch into either a retryable PrintNotSentError or a final error. */
export function classifyFetchError(err: unknown): Error {
  const code = errorCode(err);
  if (code && NOT_SENT_CODES.has(code)) return new PrintNotSentError(`Photobooth unreachable (${code})`);
  if (code && TLS_CODES.has(code)) {
    return new PrintNotSentError(`Photobooth TLS certificate rejected (${code}); set PHOTOBOOTH_INSECURE_TLS=true for its self-signed LAN certificate`);
  }
  const name = err instanceof Error ? err.name : "";
  const reason = name === "TimeoutError" || name === "AbortError" ? "timed out" : `connection lost${code ? ` (${code})` : ""}`;
  // The request may have reached the booth and printed: report, never resend.
  return new Error(`Photobooth ${reason} after the job was sent; not retried to avoid a duplicate print`);
}

/** A short, one-line reason from a FastAPI error body (`{ detail }`, a string or a validation list). */
function detailOf(text: string): string {
  try {
    const body = JSON.parse(text) as { detail?: unknown };
    if (typeof body.detail === "string") return summarize(body.detail, 200);
    if (body.detail !== undefined) return summarize(JSON.stringify(body.detail), 200);
  } catch {
    // not JSON
  }
  return summarize(text, 200);
}

/** The booth's form fields for one copy. Exported for tests. */
export function ticketFields(request: PrintRequest, settings: PhotoboothSettings): Record<string, string> {
  const options = request.options ?? {};
  return {
    layout: options.layout ?? settings.defaultLayout,
    // Layouts that exist only one way round (boarding) fall back to theirs on the booth.
    orientation: "portrait",
    caption: options.caption?.trim() || settings.caption,
    dither: "atkinson",
    ascii_mode: String(options.ascii ?? false),
    include_quote: String(settings.includeQuote),
    include_qr: String(settings.includeQr),
    strip_size: "half",
    do_print: "true",
    // The booth keeps a copy of what it printed for its keepsake page; it does not need the original too.
    keep_original: "false",
  };
}

export function createPhotoboothPrinter(
  settings: PhotoboothSettings,
  { fetchImpl, logger = silentLogger }: { fetchImpl?: BoothFetch; logger?: Logger } = {},
): Printer {
  // Scoped to booth requests: only this pool skips certificate checks, never the process.
  const dispatcher = settings.insecureTls ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined;
  const doFetch: BoothFetch = fetchImpl ?? ((url, init) => undiciFetch(url, init) as unknown as Promise<Response>);
  const endpoint = `${settings.url}/api/tickets`;

  async function printOne(request: PrintRequest, image: Buffer, copy: number): Promise<void> {
    const form = new FormData();
    for (const [key, value] of Object.entries(ticketFields(request, settings))) form.append(key, value);
    form.append("photo", new Blob([new Uint8Array(image)], { type: "image/jpeg" }), "photo.jpg");

    let res: Awaited<ReturnType<BoothFetch>>;
    try {
      res = await doFetch(endpoint, { method: "POST", body: form, signal: AbortSignal.timeout(settings.timeoutMs), dispatcher });
    } catch (err) {
      throw classifyFetchError(err);
    }
    const text = await res.text().catch(() => "");

    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new PrintNotSentError(`Photobooth unavailable (${res.status})`);
    }
    if (res.status >= 400 && res.status < 500) throw new Error(`Photobooth rejected the job (${res.status}): ${detailOf(text)}`);
    if (!res.ok) throw new Error(`Photobooth error (${res.status}): ${detailOf(text)}`);

    let print: { printed?: unknown; dry_run?: unknown; error?: unknown } | undefined;
    try {
      print = (JSON.parse(text) as { print?: typeof print }).print;
    } catch {
      print = undefined;
    }
    if (print?.printed === true) return;
    if (print?.dry_run === true) {
      logger.warn("photobooth is in dry-run mode (PRINTER_ENABLED=false); nothing came out", { jobId: request.jobId, copy });
      return;
    }
    if (typeof print?.error === "string") {
      // The booth reports how far it got. Nothing sent yet (printer off or out of reach) is safe to retry.
      if (/\bafter 0 of \d+ dot rows\b/.test(print.error)) {
        throw new PrintNotSentError(`Photobooth could not reach its printer: ${summarize(print.error, 200)}`);
      }
      throw new Error(`Photobooth printer error: ${summarize(print.error, 300)}`);
    }
    throw new Error("Photobooth sent an unexpected response; it may have printed");
  }

  return {
    async print(request) {
      const image = await readFile(request.file);
      for (let copy = request.alreadyPrinted ?? 0; copy < request.copies; copy += 1) {
        await printOne(request, image, copy + 1);
        await request.onCopyPrinted?.(copy + 1);
      }
    },
  };
}

/** GET /api/status, for a startup log line; never throws. */
export async function probePhotobooth(
  settings: Pick<PhotoboothSettings, "url" | "insecureTls">,
  fetchImpl?: BoothFetch,
): Promise<{ reachable: boolean; printerReachable?: boolean; printerEnabled?: boolean; latencyMs?: number; error?: string }> {
  const dispatcher = settings.insecureTls ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined;
  const doFetch: BoothFetch = fetchImpl ?? ((url, init) => undiciFetch(url, init) as unknown as Promise<Response>);
  try {
    const res = await doFetch(`${settings.url}/api/status`, { method: "GET", signal: AbortSignal.timeout(5_000), dispatcher });
    if (!res.ok) return { reachable: false, error: `status ${res.status}` };
    const body = JSON.parse(await res.text()) as { printer?: { enabled?: boolean; reachable?: boolean; latency_ms?: number } };
    return {
      reachable: true,
      printerEnabled: body.printer?.enabled,
      printerReachable: body.printer?.reachable,
      latencyMs: body.printer?.latency_ms,
    };
  } catch (err) {
    return { reachable: false, error: errorCode(err) ?? (err instanceof Error ? err.name : "error") };
  } finally {
    await dispatcher?.close().catch(() => undefined);
  }
}
