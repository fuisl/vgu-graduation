import { NextResponse } from "next/server";
import { INVITATION_COOKIE, invitationCookieOptions } from "../../../lib/invite/cookie";

// A real token is 128-bit random; anything wildly longer is not one.
const MAX_TOKEN_LENGTH = 512;

/**
 * First hop of an invitation link: store the token as an HttpOnly cookie and
 * redirect to /invite so the bearer token never appears in later URLs, history
 * entries or Referer headers. The token is never logged.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // 303 with a relative Location: correct behind the proxy, whatever host it presents.
  const response = new NextResponse(null, { status: 303, headers: { Location: "/invite" } });
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "no-store");

  if (token && token.length <= MAX_TOKEN_LENGTH) {
    response.cookies.set(INVITATION_COOKIE, token, invitationCookieOptions());
  }
  // Otherwise no cookie: /invite shows the "not valid" state.
  return response;
}
