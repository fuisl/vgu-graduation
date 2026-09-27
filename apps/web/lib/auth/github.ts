/**
 * Minimal custom GitHub OAuth exchange (not Auth.js/NextAuth), per
 * docs/architecture/target/open-items-and-decisions.md — the API
 * independently verifies our own session token, so a third-party
 * session format would add coupling for no benefit.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function callbackUrl(): string {
  const origin = process.env.PUBLIC_ORIGIN ?? "http://localhost:3000";
  return `${origin}/admin/auth/callback`;
}

export function buildAuthorizeUrl(state: string): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", requireEnv("GITHUB_CLIENT_ID"));
  url.searchParams.set("redirect_uri", callbackUrl());
  url.searchParams.set("scope", "read:user");
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeCodeForAccessToken(code: string): Promise<string | null> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: requireEnv("GITHUB_CLIENT_ID"),
      client_secret: requireEnv("GITHUB_CLIENT_SECRET"),
      code,
      redirect_uri: callbackUrl(),
    }),
  });

  if (!response.ok) return null;
  const body = await response.json();
  return typeof body.access_token === "string" ? body.access_token : null;
}

async function fetchGithubHandle(accessToken: string): Promise<string | null> {
  const response = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
  });

  if (!response.ok) return null;
  const body = await response.json();
  return typeof body.login === "string" ? body.login : null;
}

/** Exchanges an OAuth `code` for the signed-in user's GitHub handle, or null on any failure. */
export async function resolveGithubHandle(code: string): Promise<string | null> {
  const accessToken = await exchangeCodeForAccessToken(code);
  if (!accessToken) return null;
  return fetchGithubHandle(accessToken);
}
