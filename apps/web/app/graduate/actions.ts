"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createGraduateSession,
  endGraduateSession,
  getGraduateMe,
  inviteGraduateGuest,
  removeGraduateGuest,
  type GraduateInviteOutcome,
  type GraduateRemoveOutcome,
} from "../../lib/api/graduate";
import {
  GRADUATE_SESSION_COOKIE,
  GRADUATE_SESSION_PATH,
  GRADUATE_SIGN_IN_COOKIE,
  GRADUATE_SIGN_IN_PATH,
  graduateSessionCookieOptions,
} from "../../lib/graduate/cookie";

/*
 * Server Actions (BFF) for the graduate portal (ADR-017). Every write goes through one of these:
 * Next checks the request's Origin against its host before running an action, and the session
 * cookie is SameSite=Lax, which is how this app protects cookie-authenticated writes. The session
 * is read here and sent on as a Bearer header; it never reaches client code. Nothing is logged.
 */

const DASHBOARD = "/graduate/dashboard";
const SIGNED_OUT_HOME = "/graduate";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GraduateSignInState = "idle" | "invalid" | "failed";

/**
 * The confirmation step of signing in. This POST, not opening the link, spends the sign-in token, so
 * a mail scanner following the GET can't use it up. A link that can't be used by someone already
 * signed in (they opened it a second time) just goes to the dashboard.
 */
export async function confirmGraduateSignIn(): Promise<GraduateSignInState> {
  const store = await cookies();
  const token = store.get(GRADUATE_SIGN_IN_COOKIE)?.value;
  if (!token) return "invalid";

  const result = await createGraduateSession(token);
  if (result.status === "error") return "failed"; // Keeps the cookie, so the same button can try again.

  store.delete({ name: GRADUATE_SIGN_IN_COOKIE, path: GRADUATE_SIGN_IN_PATH });
  if (result.status === "invalid") {
    const session = store.get(GRADUATE_SESSION_COOKIE)?.value;
    if (session && (await getGraduateMe(session)).status === "ok") redirect(DASHBOARD);
    return "invalid";
  }
  store.set(GRADUATE_SESSION_COOKIE, result.data.token, graduateSessionCookieOptions());
  redirect(DASHBOARD);
}

/** Ends the session in the API and drops the cookie. If the API can't be reached the cookie still goes. */
export async function signOutGraduate(): Promise<void> {
  const store = await cookies();
  const session = store.get(GRADUATE_SESSION_COOKIE)?.value;
  if (session) await endGraduateSession(session);
  store.delete({ name: GRADUATE_SESSION_COOKIE, path: GRADUATE_SESSION_PATH });
  redirect(SIGNED_OUT_HOME);
}

const tooLong = (value: unknown, max: number) => typeof value !== "string" || value.trim().length === 0 || value.length > max;

/** A graduate invites a guest. The API knows who from the session: no join code from the browser. */
export async function inviteGuest(name: string, email: string): Promise<GraduateInviteOutcome> {
  if (tooLong(name, 120) || tooLong(email, 254)) return "invalid";
  const session = (await cookies()).get(GRADUATE_SESSION_COOKIE)?.value;
  if (!session) redirect(SIGNED_OUT_HOME);
  const outcome = await inviteGraduateGuest(session, { name: name.trim(), email: email.trim() });
  if (outcome === "signed_out") redirect(SIGNED_OUT_HOME);
  if (outcome === "invited" || outcome === "already_invited") revalidatePath(DASHBOARD);
  return outcome;
}

/** A graduate removes a guest from their list; the API decides whether the invitation is revoked. */
export async function removeGuest(id: string): Promise<GraduateRemoveOutcome> {
  if (typeof id !== "string" || !UUID.test(id)) return "not_found";
  const session = (await cookies()).get(GRADUATE_SESSION_COOKIE)?.value;
  if (!session) redirect(SIGNED_OUT_HOME);
  const outcome = await removeGraduateGuest(session, id);
  if (outcome === "signed_out") redirect(SIGNED_OUT_HOME);
  if (outcome !== "failed" && outcome !== "limited") revalidatePath(DASHBOARD);
  return outcome;
}
