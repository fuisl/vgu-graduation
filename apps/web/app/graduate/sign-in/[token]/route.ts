import { graduateTokenSchema } from "@grad/contract";
import { NextResponse } from "next/server";
import { GRADUATE_SIGN_IN_COOKIE, graduateSignInCookieOptions } from "../../../../lib/graduate/cookie";

/**
 * First hop of the emailed sign-in link (ADR-017), like /invite/[token]: move the token into a
 * short-lived HttpOnly cookie and redirect, so it leaves the URL, history and Referer at once.
 *
 * This GET spends nothing and calls no API. Mail scanners and link previews follow links, so only
 * the confirmation POST on the next page uses the token up. The token is never logged.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // 303 with a relative Location: correct behind the proxy, whatever host it presents.
  const response = new NextResponse(null, { status: 303, headers: { Location: "/graduate/sign-in" } });
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");

  if (graduateTokenSchema.safeParse(token).success) {
    response.cookies.set(GRADUATE_SIGN_IN_COOKIE, token, graduateSignInCookieOptions());
  }
  // Otherwise no cookie: the page says the link can't be used.
  return response;
}
