import { joinInfoSchema, type JoinInfo, type MailLocale } from "@grad/contract";
import { apiFetch } from "./client";

/*
 * Guest self-registration (ADR-015). Every call is no-store and nothing here logs:
 * the bodies carry addresses and names people typed.
 */

/** GET /join/{code}: who is inviting. `unknown` for a code the API doesn't know, `error` when it can't be asked. */
export async function getJoinInfo(code: string): Promise<{ status: "ok"; data: JoinInfo } | { status: "unknown" } | { status: "error" }> {
  let response: Response;
  try {
    response = await apiFetch(`/join/${encodeURIComponent(code)}`, { cache: { mode: "no-store" } });
  } catch {
    return { status: "error" };
  }
  if (response.status === 404 || response.status === 400) return { status: "unknown" };
  if (!response.ok) return { status: "error" };
  const parsed = joinInfoSchema.safeParse(await response.json().catch(() => null));
  return parsed.success ? { status: "ok", data: parsed.data } : { status: "error" };
}

/** How a guest registration went, as the join form shows it. */
export type JoinOutcome = "registered" | "invalid" | "unknown" | "limited" | "unavailable" | "failed";

/** POST /join/{code}. */
export async function registerGuest(code: string, body: { name: string; email: string; website?: string }): Promise<JoinOutcome> {
  let response: Response;
  try {
    response = await apiFetch(`/join/${encodeURIComponent(code)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: { mode: "no-store" },
    });
  } catch {
    return "failed";
  }
  if (response.ok) return "registered";
  switch (response.status) {
    case 400:
      return "invalid";
    case 404:
      return "unknown";
    case 429:
      return "limited";
    case 503:
      return "unavailable";
    default:
      return "failed";
  }
}

/** How a graduate's link request went. `accepted` says nothing about whether the address is a graduate's. */
export type JoinLinkOutcome = "accepted" | "invalid" | "unavailable" | "failed";

/** POST /join-links/request. */
export async function requestJoinLink(email: string, locale: MailLocale): Promise<JoinLinkOutcome> {
  let response: Response;
  try {
    response = await apiFetch("/join-links/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, locale }),
      cache: { mode: "no-store" },
    });
  } catch {
    return "failed";
  }
  if (response.ok) return "accepted";
  if (response.status === 400) return "invalid";
  if (response.status === 503) return "unavailable";
  return "failed";
}
