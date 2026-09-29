import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  cookieStore.delete("admin_session");
  // 303 so the browser follows with GET: /admin/login has no POST handler (307 would re-POST).
  return NextResponse.redirect(new URL("/admin/login", request.url), 303);
}
