import { NextResponse } from "next/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale } from "../../../lib/i18n/config";
import { safeReturnPath } from "../../../lib/i18n/return-path";

/**
 * POST /api/locale (#9): the EN | VI switch in the header and footer is a plain form, so it works
 * without JavaScript. Stores the choice for a year and sends the guest back to the page they were
 * on with a 303 and a relative Location. Only the path comes back (safeReturnPath), so no token or
 * query string is ever echoed. Nothing is logged.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const choice = form?.get("lang");
  const locale = isLocale(choice) ? choice : DEFAULT_LOCALE;

  const response = new NextResponse(null, { status: 303, headers: { Location: safeReturnPath(form?.get("next")) } });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  });
  return response;
}
