/**
 * Thin API client. No domain logic lives here (§4.1) — it forwards the
 * credential, applies the caching policy from the table in §4.1, and
 * returns a plain Response for the caller to interpret.
 */

export type CacheConfig = { mode: "revalidate"; seconds: number; tags?: string[] } | { mode: "no-store" };

export interface ApiRequestInit {
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit;
  cache: CacheConfig;
}

function apiOrigin(): string {
  return process.env.API_ORIGIN ?? "http://localhost:4000";
}

export async function apiFetch(path: string, init: ApiRequestInit): Promise<Response> {
  const { cache, method, headers, body } = init;

  const fetchInit: RequestInit & { next?: { revalidate?: number; tags?: string[] } } = {
    method,
    headers,
    body,
  };

  if (cache.mode === "no-store") {
    fetchInit.cache = "no-store";
  } else {
    fetchInit.next = { revalidate: cache.seconds, tags: cache.tags };
  }

  return fetch(`${apiOrigin()}${path}`, fetchInit);
}

/** SHA-256 hex digest, used to derive cache tags from a bearer token without ever storing the raw token as a tag (tags may surface in logs/traces). */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
