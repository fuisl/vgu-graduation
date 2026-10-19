/**
 * URL scrubbing for Vercel Speed Insights (#8).
 *
 * Invitation URLs are bearer credentials (AGENTS.md, ADR-003), so nothing that could carry a token
 * may reach a third party. `/invite/<token>` is a route handler that redirects before any page
 * renders, but a mistyped or truncated link can still land on the 404 page with the token in its
 * path, so every reported URL is reduced to a route pattern here:
 * - the query string and fragment are always dropped;
 * - the path is percent-decoded first (until stable, so `%2F` and `%2561` cannot hide a slash or a
 *   letter), and a path that does not decode cleanly is not reported at all (fail closed);
 * - the segment after `invite` (any case) becomes `[token]`, except the static `/invite/demo`;
 * - any run of 20 or more base64url characters (the shape of a 128-bit token) becomes `[id]`, also
 *   inside a segment, so `/<token>.` or `/x/<token>~` lose the token too;
 * - admin pages are not reported at all (their paths can name guests and graduates), however
 *   their first segment is cased or encoded (`/ADMIN`, `/%61dmin`).
 */

/** The event shape `@vercel/speed-insights` hands to `beforeSend`. */
export interface SpeedInsightsEvent {
  type: "vital";
  url: string;
  route?: string;
}

const BASE = "https://scrub.invalid";
const TOKEN_RUN = /[A-Za-z0-9_-]{20,}/g;
const STATIC_INVITE_CHILDREN = new Set(["demo"]);
/** Decoding passes before giving up: real paths need one, double-encoded ones two. */
const MAX_DECODE_PASSES = 3;

/**
 * Reduces a pathname to a route pattern with no token or identifier in it, or `null` when it is an
 * admin page or its percent-encoding is malformed (never reported).
 */
export function scrubPathname(pathname: string): string | null {
  const decoded = decodePath(pathname);
  if (decoded === null) return null;
  const segments = decoded.split("/");
  if (isAdmin(segments)) return null;
  const out = segments.map((segment, i) => {
    const previous = i > 0 ? segments[i - 1] : undefined;
    const afterInvite = previous !== undefined && /^invite$/i.test(previous);
    if (afterInvite && segment !== "" && !STATIC_INVITE_CHILDREN.has(segment)) return "[token]";
    return encodeSegment(segment.replace(TOKEN_RUN, "[id]"));
  });
  return out.join("/") || "/";
}

/** Rewrites a reported URL to its origin plus a scrubbed pathname; `null` when it is admin or cannot be parsed. */
export function scrubUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url, BASE);
  } catch {
    return null;
  }
  const path = scrubPathname(parsed.pathname);
  if (path === null) return null;
  return parsed.origin === BASE ? path : `${parsed.origin}${path}`;
}

/** `beforeSend` hook: scrubs `url` and `route`, or drops the event (admin, unparseable). */
export function scrubSpeedInsightsEvent<T extends SpeedInsightsEvent>(event: T): T | null {
  const url = scrubUrl(event.url);
  if (url === null) return null;
  if (event.route === undefined) return { ...event, url };
  const route = scrubUrl(event.route);
  if (route === null) return null;
  return { ...event, url, route };
}

/** Percent-decodes until stable; `null` on malformed encoding or when it never settles. */
function decodePath(pathname: string): string | null {
  let current = pathname;
  for (let pass = 0; pass < MAX_DECODE_PASSES; pass++) {
    if (!current.includes("%")) return current;
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      return null;
    }
    if (next === current) return current;
    current = next;
  }
  return current.includes("%") ? null : current;
}

/** The first non-empty segment is `admin` in any case (`//admin` and `/ADMIN/x` included). */
function isAdmin(segments: readonly string[]): boolean {
  const first = segments.find((segment) => segment !== "");
  return first !== undefined && first.toLowerCase() === "admin";
}

/** Re-encodes a decoded segment for the report, keeping the `[token]`/`[id]` placeholders readable. */
function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%5B/g, "[").replace(/%5D/g, "]");
}
