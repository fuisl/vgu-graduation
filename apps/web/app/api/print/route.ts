import { PRINT_GUEST_RATE_LIMIT } from "@grad/contract";
import { type NextRequest, NextResponse } from "next/server";
import { getInvitation } from "../../../lib/api/invitations";
import { guestPrintsEnabled, requestGuestPrint } from "../../../lib/api/print";
import { INVITATION_COOKIE } from "../../../lib/invite/cookie";

/**
 * Guest print requests through the BFF (#74, experimental), so the HttpOnly
 * invitation cookie never reaches client JS.
 *
 *   GET  /api/print  200 `{ enabled, signedIn, perHour }`: whether the gallery shows "Request a print".
 *   POST /api/print  `{ photoPublicId }` → POST /print/jobs with one copy. Passes the API's
 *        status through (201, 401/404/410 invitation, 403 disabled, 409 not printable,
 *        429 with Retry-After and `retryAfterSeconds`).
 *
 * Off unless PRINT_GUEST_REQUESTS_ENABLED=true (mirrors the API flag). Never logs the token.
 */
const HEADERS = { "Cache-Control": "private, no-store" };

function problem(status: number, error: string, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return NextResponse.json({ error, message, ...extra }, { status, headers: { ...HEADERS, ...headers } });
}

export async function GET(request: NextRequest) {
  const enabled = guestPrintsEnabled();
  const token = request.cookies.get(INVITATION_COOKIE)?.value;
  let signedIn = false;
  // Only ask the API when the action could be shown; the lookup is cached per invitation.
  if (enabled && token) {
    const invitation = await getInvitation(token);
    signedIn = invitation.status === "ok" && invitation.data.status === "active";
  }
  return NextResponse.json({ enabled, signedIn, perHour: PRINT_GUEST_RATE_LIMIT.max }, { headers: HEADERS });
}

export async function POST(request: NextRequest) {
  if (!guestPrintsEnabled()) return problem(403, "Forbidden", "Guests can't request prints at the moment");

  const token = request.cookies.get(INVITATION_COOKIE)?.value;
  if (!token) return problem(401, "Unauthorized", "Open your invitation link before requesting a print");

  // A JSON body only: a cross-site form can't send one without a CORS preflight.
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return problem(415, "Unsupported Media Type", "Send the request as JSON");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return problem(400, "Bad Request", "The request was not valid JSON");
  }
  const photoPublicId =
    body && typeof body === "object" && "photoPublicId" in body && typeof body.photoPublicId === "string"
      ? body.photoPublicId.trim()
      : "";
  if (!photoPublicId || photoPublicId.length > 200) return problem(400, "Bad Request", "Choose a photo to print");

  const result = await requestGuestPrint(token, photoPublicId);
  if (result.status === "ok") return NextResponse.json(result.job, { status: 201, headers: HEADERS });

  if (result.retryAfterSeconds !== undefined) {
    return problem(
      result.httpStatus,
      "Too Many Requests",
      result.message,
      { retryAfterSeconds: result.retryAfterSeconds },
      { "Retry-After": String(result.retryAfterSeconds) },
    );
  }
  return problem(result.httpStatus, "Print request failed", result.message);
}
