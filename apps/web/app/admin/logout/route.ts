import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  // 303 so the browser follows with GET: /admin/login has no POST handler (307 would re-POST).
  const response = NextResponse.redirect(new URL("/admin/login", request.url), 303);
  // Expire the cookie with the same Domain and Path it was set with in auth/callback;
  // a delete without them leaves the parent-domain cookie (and the session) in place.
  response.cookies.set("admin_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    domain: process.env.COOKIE_DOMAIN,
    maxAge: 0,
  });
  return response;
}
