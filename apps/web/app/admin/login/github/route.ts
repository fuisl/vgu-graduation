import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "../../../../lib/auth/github";

const STATE_COOKIE = "admin_oauth_state";

export async function GET() {
  const state = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: 300, // 5 minutes — just long enough to complete the GitHub redirect round trip
  });

  return NextResponse.redirect(buildAuthorizeUrl(state));
}
