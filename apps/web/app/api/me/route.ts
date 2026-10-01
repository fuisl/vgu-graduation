import { type NextRequest, NextResponse } from "next/server";
import { getInvitation } from "../../../lib/api/invitations";
import { INVITATION_COOKIE } from "../../../lib/invite/cookie";

/**
 * GET /api/me: the signed-in guest chip's data (#146).
 *
 * The invitation cookie is HttpOnly (a bearer credential), so the browser cannot read the guest's name; this BFF route does, server-side, and returns only:
 *   - signed in:  200 `{ signedIn: true, firstName, avatarSeed }` (`firstName` is the last word of the guest name, see #170)
 *   - otherwise:  200 `{ signedIn: false }` (no cookie, unknown/expired/revoked invitation, API down)
 * It is always 200 so the header never logs a failed request; the chip simply stays signed out.
 * `avatarSeed` is the guest id (a random UUID, never the token or an email). Responses are `private, no-store`.
 */
const HEADERS = { "Cache-Control": "private, no-store" };
const SIGNED_OUT = { signedIn: false } as const;

export async function GET(request: NextRequest) {
  const token = request.cookies.get(INVITATION_COOKIE)?.value;
  if (!token) return NextResponse.json(SIGNED_OUT, { headers: HEADERS });

  const result = await getInvitation(token);
  if (result.status !== "ok" || result.data.status !== "active") {
    return NextResponse.json(SIGNED_OUT, { headers: HEADERS });
  }

  const { guest } = result.data;
  // The chip shows the LAST whitespace-separated word (Vietnamese names are family-name first); a single word is used whole.
  // TODO(#170): use givenName once the data model separates names
  const words = guest.name.trim().split(/\s+/);
  const firstName = words[words.length - 1];
  return NextResponse.json({ signedIn: true, firstName, avatarSeed: guest.id }, { headers: HEADERS });
}
