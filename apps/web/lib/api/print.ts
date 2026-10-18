import { createPrintJobResponseSchema, PRINT_GUEST_RATE_LIMIT, type PrintJob } from "@grad/contract";
import { apiFetch } from "./client";

/**
 * Guest print requests (#74, experimental). Off unless the server-side env
 * `PRINT_GUEST_REQUESTS_ENABLED=true`, the same name and meaning as the API's
 * flag: set both, the web one only decides whether to show the action and the
 * API still enforces its own (403 when off). Read at request time, never
 * exposed as NEXT_PUBLIC_*, so turning it off needs no rebuild.
 */
export function guestPrintsEnabled(raw: string | undefined = process.env.PRINT_GUEST_REQUESTS_ENABLED): boolean {
  return raw?.trim().toLowerCase() === "true";
}

export type GuestPrintResult =
  | { status: "ok"; job: PrintJob }
  | { status: "error"; httpStatus: number; message: string; retryAfterSeconds?: number };

/** Seconds from a Retry-After header (delta-seconds or an HTTP date); undefined when absent or unreadable. */
export function parseRetryAfter(header: string | null, now: number = Date.now()): number | undefined {
  if (!header) return undefined;
  const value = header.trim();
  if (/^\d+$/.test(value)) return Number(value);
  const at = Date.parse(value);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "message" in body && typeof body.message === "string") return body.message;
  } catch {
    // Fall through.
  }
  return "The print request was not accepted";
}

/** POST /print/jobs as a guest: one copy of a visible photo, with the invitation credential. Never cached. */
export async function requestGuestPrint(token: string, photoPublicId: string): Promise<GuestPrintResult> {
  let response: Response;
  try {
    response = await apiFetch("/print/jobs", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ photoPublicId, copies: 1 }),
      cache: { mode: "no-store" },
    });
  } catch {
    return { status: "error", httpStatus: 503, message: "Could not reach the API" };
  }

  if (!response.ok) {
    const retryAfterSeconds =
      response.status === 429
        ? (parseRetryAfter(response.headers.get("Retry-After")) ?? PRINT_GUEST_RATE_LIMIT.windowSeconds)
        : undefined;
    return { status: "error", httpStatus: response.status, message: await errorMessage(response), retryAfterSeconds };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: "error", httpStatus: 502, message: "The API response was not valid JSON" };
  }
  const parsed = createPrintJobResponseSchema.safeParse(body);
  if (!parsed.success) return { status: "error", httpStatus: 502, message: "The API response did not match the expected shape" };
  return { status: "ok", job: parsed.data };
}
