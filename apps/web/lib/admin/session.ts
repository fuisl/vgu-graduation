import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ApiResult } from "../api/result";
import { verifyAdminSession } from "../auth/session";

export const ADMIN_SESSION_COOKIE = "admin_session";
const LOGIN_PATH = "/admin/login";

export interface AdminSession {
  /** The raw session JWT. Server-only: forward it as `Authorization: Bearer`, never render or log it. */
  token: string;
  handle: string;
}

/**
 * Reads and verifies the HttpOnly `admin_session` cookie. Missing, invalid or
 * expired sessions redirect to sign-in. Call it in every admin page and Server
 * Action: layouts alone do not guard actions.
 */
export async function requireAdminSession(): Promise<AdminSession> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  const session = token ? await verifyAdminSession(token) : null;
  if (!token || !session) redirect(LOGIN_PATH);
  return { token, handle: session.handle };
}

/** The API rejected the session (expired between our check and its own): sign in again. */
export function redirectIfUnauthorized(result: ApiResult<unknown>): void {
  if (result.status === "error" && result.httpStatus === 401) redirect(LOGIN_PATH);
}

/**
 * For GET /admin/me: also leaves on 403, which means the account was revoked
 * (or never approved) since the session was issued (#119).
 */
export function redirectIfNotAdmin(result: ApiResult<unknown>): void {
  redirectIfUnauthorized(result);
  if (result.status === "error" && result.httpStatus === 403) redirect(`${LOGIN_PATH}?status=denied`);
}
