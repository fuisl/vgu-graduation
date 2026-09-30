import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { requestAdminAccess } from "../../../../lib/api/admin";
import { resolveGithubHandle } from "../../../../lib/auth/github";
import { mintAdminSession } from "../../../../lib/auth/session";

const STATE_COOKIE = "admin_oauth_state";
const SESSION_COOKIE = "admin_session";

function redirectToLogin(request: NextRequest, query: string) {
  return NextResponse.redirect(new URL(`/admin/login?${query}`, request.url));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;

  cookieStore.delete(STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectToLogin(request, "error=state");
  }

  const handle = await resolveGithubHandle(code);
  if (!handle) {
    return redirectToLogin(request, "error=oauth");
  }

  // Any GitHub account may ask; the API files a pending request for a first-time
  // handle and only an owner-approved account gets the session cookie (#119).
  const token = await mintAdminSession(handle);
  const access = await requestAdminAccess(token);
  if (access.status !== "ok") {
    return redirectToLogin(request, "error=unavailable");
  }
  if (access.data.status === "pending") {
    return redirectToLogin(request, "status=pending");
  }
  if (access.data.status !== "approved") {
    return redirectToLogin(request, "status=denied");
  }

  const response = NextResponse.redirect(new URL("/admin", request.url));
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    domain: process.env.COOKIE_DOMAIN,
    maxAge: 60 * 60, // matches the token's own 1h expiry (lib/auth/session.ts)
  });
  return response;
}
