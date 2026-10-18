import { mediaVariantSchema } from "@grad/contract";
import { cookies } from "next/headers";
import { adminMediaVariantPath } from "../../../../../lib/api/admin";
import { apiFetch } from "../../../../../lib/api/client";
import { ADMIN_SESSION_COOKIE } from "../../../../../lib/admin/session";
import { verifyAdminSession } from "../../../../../lib/auth/session";

/**
 * GET /admin/preview/{publicId}/{variant}: the moderation queue's thumbnails
 * (#64). Streams GET /admin/media/{publicId}/{variant} from the API, which
 * serves photos in any moderation state to admins only. The session token
 * stays server-side in the Authorization header; the browser only ever sends
 * its HttpOnly cookie. Nothing is cached anywhere, so a restored or removed
 * photo is never served from a stale copy and hidden photos never sit in a
 * shared cache.
 */

const PUBLIC_ID = /^[A-Za-z0-9_-]{1,128}$/;

const NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

function empty(status: number, extra: Record<string, string> = {}): Response {
  return new Response(null, { status, headers: { ...NO_STORE, ...extra } });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string; variant: string }> }
): Promise<Response> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token || !(await verifyAdminSession(token))) return empty(401);

  const { publicId, variant } = await params;
  const parsedVariant = mediaVariantSchema.safeParse(variant);
  if (!PUBLIC_ID.test(publicId) || !parsedVariant.success) return empty(404);

  let upstream: Response;
  try {
    upstream = await apiFetch(adminMediaVariantPath(publicId, parsedVariant.data), {
      headers: { Authorization: `Bearer ${token}` },
      cache: { mode: "no-store" },
    });
  } catch {
    return empty(502);
  }

  if (!upstream.ok || !upstream.body) {
    // Drop the body: error JSON is not an image, and the status says enough (401/403/404/503).
    await upstream.body?.cancel().catch(() => undefined);
    const retryAfter = upstream.headers.get("Retry-After");
    const status = upstream.ok ? 502 : upstream.status;
    return empty(status, retryAfter ? { "Retry-After": retryAfter } : {});
  }

  const headers: Record<string, string> = { ...NO_STORE, "Content-Type": "image/jpeg" };
  const length = upstream.headers.get("Content-Length");
  if (length) headers["Content-Length"] = length;
  return new Response(upstream.body, { status: 200, headers });
}
