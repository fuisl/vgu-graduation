/**
 * URL scrubbing for Vercel Speed Insights (#8).
 *
 * Invitation URLs are bearer credentials (AGENTS.md, ADR-003), so nothing that could carry a token
 * may reach a third party. `/invite/<token>` is a route handler that redirects before any page
 * renders, but a mistyped or truncated link can still land on the 404 page with the token in its
 * path, so every reported URL is reduced to a route pattern here:
 * - the query string and fragment are always dropped;
 * - the segment after `invite` (any case) becomes `[token]`, except the static `/invite/demo`;
 * - any other segment that looks like a random identifier (20 or more base64url characters, the
 *   shape of a 128-bit token) becomes `[id]`;
 * - admin pages are not reported at all (their paths can name guests and graduates).
 */

/** The event shape `@vercel/speed-insights` hands to `beforeSend`. */
export interface SpeedInsightsEvent {
  type: "vital";
  url: string;
  route?: string;
}

const BASE = "https://scrub.invalid";
const TOKEN_LIKE = /^[A-Za-z0-9_-]{20,}$/;
const STATIC_INVITE_CHILDREN = new Set(["demo"]);

/** Reduces a pathname to a route pattern with no token or identifier in it. */
export function scrubPathname(pathname: string): string {
  const segments = pathname.split("/");
  const out = segments.map((segment, i) => {
    const previous = i > 0 ? segments[i - 1] : undefined;
    const afterInvite = previous !== undefined && /^invite$/i.test(safeDecode(previous));
    if (afterInvite && segment !== "" && !STATIC_INVITE_CHILDREN.has(segment)) return "[token]";
    return TOKEN_LIKE.test(safeDecode(segment)) ? "[id]" : segment;
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
  if (/^\/admin(?:\/|$)/i.test(parsed.pathname)) return null;
  const path = scrubPathname(parsed.pathname);
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

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
