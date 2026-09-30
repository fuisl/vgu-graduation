import { createWishRequestSchema } from "@grad/contract";
import { type NextRequest, NextResponse } from "next/server";
import { createWish } from "../../../lib/api/wishes";
import { INVITATION_COOKIE } from "../../../lib/invite/cookie";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(INVITATION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Open your invitation link before leaving a wish" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Bad Request", message: "The wish was not valid JSON" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const parsed = createWishRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Bad Request", message: "Enter a message between 1 and 1000 characters" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const result = await createWish(token, parsed.data);
  if (result.status === "ok") {
    return NextResponse.json(result.data, { status: 201, headers: { "Cache-Control": "no-store" } });
  }

  if (result.status === "empty") {
    return NextResponse.json(
      { error: "Service Unavailable", message: "The wish service returned no result" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { error: result.kind, message: result.message },
    { status: result.httpStatus ?? 503, headers: { "Cache-Control": "no-store" } },
  );
}
