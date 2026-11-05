import {
  graduateGuestsResponseSchema,
  graduateInviteResponseSchema,
  graduateMeResponseSchema,
  graduateRemoveGuestResponseSchema,
  graduateSessionResponseSchema,
  type GraduateGuestsResponse,
  type GraduateMeResponse,
  type GraduateSessionResponse,
} from "@grad/contract";
import { apiFetch } from "./client";

/*
 * Graduate portal (ADR-017). The session token goes to the API as a Bearer header from here, the
 * server side of the web app, and never reaches client code. Every call is no-store and nothing
 * here logs: the bodies carry tokens, names and addresses.
 */

/** `unauthorized`: the session is gone (signed out, expired). `error`: the API can't be asked; degrade that section. */
export type GraduateRead<T> = { status: "ok"; data: T } | { status: "unauthorized" } | { status: "error" };

function bearer(session: string): HeadersInit {
  return { Authorization: `Bearer ${session}` };
}

async function read<T>(path: string, session: string, parse: (body: unknown) => { success: true; data: T } | { success: false }): Promise<GraduateRead<T>> {
  let response: Response;
  try {
    response = await apiFetch(path, { headers: bearer(session), cache: { mode: "no-store" } });
  } catch {
    return { status: "error" };
  }
  if (response.status === 401) return { status: "unauthorized" };
  if (!response.ok) return { status: "error" };
  const parsed = parse(await response.json().catch(() => null));
  return parsed.success ? { status: "ok", data: parsed.data } : { status: "error" };
}

/** GET /graduate/me: who is signed in and their join link. */
export function getGraduateMe(session: string): Promise<GraduateRead<GraduateMeResponse>> {
  return read("/graduate/me", session, (body) => graduateMeResponseSchema.safeParse(body));
}

/** GET /graduate/guests: this graduate's guests. */
export function getGraduateGuests(session: string): Promise<GraduateRead<GraduateGuestsResponse>> {
  return read("/graduate/guests", session, (body) => graduateGuestsResponseSchema.safeParse(body));
}

/** POST /graduate/sessions: spends a sign-in token. `invalid`: unknown, used or expired. `error`: try again. */
export async function createGraduateSession(
  token: string,
): Promise<{ status: "ok"; data: GraduateSessionResponse } | { status: "invalid" } | { status: "error" }> {
  let response: Response;
  try {
    response = await apiFetch("/graduate/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      cache: { mode: "no-store" },
    });
  } catch {
    return { status: "error" };
  }
  if (response.status === 401 || response.status === 400) return { status: "invalid" };
  if (!response.ok) return { status: "error" };
  const parsed = graduateSessionResponseSchema.safeParse(await response.json().catch(() => null));
  return parsed.success ? { status: "ok", data: parsed.data } : { status: "error" };
}

/** DELETE /graduate/sessions/current. Whether it reached the API or not, the caller drops the cookie. */
export async function endGraduateSession(session: string): Promise<boolean> {
  try {
    const response = await apiFetch("/graduate/sessions/current", {
      method: "DELETE",
      headers: bearer(session),
      cache: { mode: "no-store" },
    });
    return response.ok || response.status === 401;
  } catch {
    return false;
  }
}

/** How inviting a guest went, as the form shows it. */
export type GraduateInviteOutcome = "invited" | "already_invited" | "invalid" | "signed_out" | "limited" | "unavailable" | "failed";

/** POST /graduate/guests. */
export async function inviteGraduateGuest(session: string, body: { name: string; email: string }): Promise<GraduateInviteOutcome> {
  let response: Response;
  try {
    response = await apiFetch("/graduate/guests", {
      method: "POST",
      headers: { ...bearer(session), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: { mode: "no-store" },
    });
  } catch {
    return "failed";
  }
  if (response.ok) {
    const parsed = graduateInviteResponseSchema.safeParse(await response.json().catch(() => null));
    return parsed.success ? parsed.data.status : "failed";
  }
  switch (response.status) {
    case 400:
      return "invalid";
    case 401:
      return "signed_out";
    case 429:
      return "limited";
    case 503:
      return "unavailable";
    default:
      return "failed";
  }
}

/** How removing a guest went, as the list shows it. */
export type GraduateRemoveOutcome = "revoked" | "unlinked" | "not_found" | "signed_out" | "limited" | "failed";

/** DELETE /graduate/guests/{id}. */
export async function removeGraduateGuest(session: string, id: string): Promise<GraduateRemoveOutcome> {
  let response: Response;
  try {
    response = await apiFetch(`/graduate/guests/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: bearer(session),
      cache: { mode: "no-store" },
    });
  } catch {
    return "failed";
  }
  if (response.ok) {
    const parsed = graduateRemoveGuestResponseSchema.safeParse(await response.json().catch(() => null));
    return parsed.success ? parsed.data.outcome : "failed";
  }
  switch (response.status) {
    case 400:
    case 404:
      return "not_found";
    case 401:
      return "signed_out";
    case 429:
      return "limited";
    default:
      return "failed";
  }
}
