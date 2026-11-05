import { GRADUATE_SESSION_TTL_MS, GRADUATE_SIGN_IN_TTL_MS } from "@grad/contract";

/** The portal session (ADR-017): a credential of its own, separate from the invitation cookie `inv`. */
export const GRADUATE_SESSION_COOKIE = "grad_portal";

/** Holds an emailed sign-in token between opening the link and confirming, so it leaves the URL at once. */
export const GRADUATE_SIGN_IN_COOKIE = "grad_sign_in";

export const GRADUATE_SESSION_PATH = "/graduate";
export const GRADUATE_SIGN_IN_PATH = "/graduate/sign-in";

/**
 * Like `inv` (HttpOnly, Secure in production, SameSite=Lax), with one deliberate difference: no
 * `Domain`, so it is host-only. Only the BFF on the web host reads it; the API takes the token as a
 * Bearer header and reads no cookie (ADR-017). It never reaches the API host, and is narrower than
 * the two hostnames ADR-003 allows.
 */
function baseOptions(env: { NODE_ENV?: string }) {
  return {
    httpOnly: true,
    // Local http dev (also via the Caddy stand-in) can't store Secure cookies.
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
  };
}

export function graduateSessionCookieOptions(env: { NODE_ENV?: string } = process.env) {
  return { ...baseOptions(env), path: GRADUATE_SESSION_PATH, maxAge: GRADUATE_SESSION_TTL_MS / 1000 };
}

export function graduateSignInCookieOptions(env: { NODE_ENV?: string } = process.env) {
  return { ...baseOptions(env), path: GRADUATE_SIGN_IN_PATH, maxAge: GRADUATE_SIGN_IN_TTL_MS / 1000 };
}
