/** Longest path the language switch redirects back to; anything longer goes home. */
const MAX_PATH_LENGTH = 512;

/**
 * Where POST /api/locale sends the guest back to (#9): a same-site path only, never a full URL,
 * and never a query string or fragment (nothing from them is needed, and nothing in them is echoed).
 * `/invite/<token>` collapses to `/invite`, so a bearer token can never appear in a redirect even if
 * one was posted. Anything else unexpected is `/`. Pure.
 */
export function safeReturnPath(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_PATH_LENGTH) return "/";
  // A path, not a scheme-relative URL ("//host"), a backslash trick ("/\host") or a control character.
  if (!raw.startsWith("/") || raw.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(raw)) return "/";
  let path: string;
  try {
    path = new URL(raw, "http://local.invalid").pathname;
  } catch {
    return "/";
  }
  if (path.startsWith("//")) return "/";
  if (path === "/invite" || path.startsWith("/invite/")) return "/invite";
  // Route handlers have no page to return to.
  if (path === "/api" || path.startsWith("/api/")) return "/";
  return path;
}
