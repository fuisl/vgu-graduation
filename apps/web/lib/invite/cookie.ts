/** The invitation bearer credential cookie, read by the web BFF and by the API host (ADR-003). */
export const INVITATION_COOKIE = "inv";

/** Roughly until after the ceremony; a re-opened link simply sets it again. */
export const INVITATION_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

export function invitationCookieOptions(env: { NODE_ENV?: string; COOKIE_DOMAIN?: string } = process.env) {
  const domain = env.COOKIE_DOMAIN?.trim();
  return {
    httpOnly: true,
    // Local http dev (also via the Caddy stand-in) can't store Secure cookies.
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: INVITATION_COOKIE_MAX_AGE,
    ...(domain ? { domain } : {}),
  };
}
