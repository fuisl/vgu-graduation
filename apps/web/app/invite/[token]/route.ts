import { NextResponse } from "next/server";
import { INVITE_ANSWER_PARAM } from "@grad/contract";
import { inviteLocation, parseInviteAnswer } from "../../../lib/invite/answer";
import { INVITATION_COOKIE, invitationCookieOptions } from "../../../lib/invite/cookie";

// A real token is 128-bit random; anything wildly longer is not one.
const MAX_TOKEN_LENGTH = 512;

/**
 * First hop of an invitation link: store the token as an HttpOnly cookie and
 * redirect to /invite so the bearer token never appears in later URLs, history
 * entries or Referer headers. The token is never logged.
 *
 * An email's Yes / No link also carries an answer, which only travels on to pre-select the form
 * (ADR-016). Mail link scanners fetch every link, so nothing here or on /invite may save an RSVP.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const usable = Boolean(token) && token.length <= MAX_TOKEN_LENGTH;
  const answers = new URL(request.url).searchParams.getAll(INVITE_ANSWER_PARAM);
  // Exactly one known value; a bad token carries none, as the cookie may belong to another invitation.
  const answer = usable && answers.length === 1 ? parseInviteAnswer(answers[0]) : null;

  // 303 with a relative Location: correct behind the proxy, whatever host it presents.
  const response = new NextResponse(null, { status: 303, headers: { Location: inviteLocation(answer) } });
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "no-store");

  if (usable) {
    response.cookies.set(INVITATION_COOKIE, token, invitationCookieOptions());
  }
  // Otherwise no cookie: /invite shows the "not valid" state.
  return response;
}
