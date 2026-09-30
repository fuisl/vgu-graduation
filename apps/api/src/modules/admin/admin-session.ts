import { jwtVerify } from "jose";
import { config } from "../../config.js";

/**
 * Verifies the short-lived session token minted by apps/web after GitHub
 * sign-in (docs/architecture/target/applications-and-repository.md §4.1,
 * §4.3). HS256, shared secret, claim `sub` is the GitHub handle. This only
 * proves who is calling: requireAdmin (admin-auth.ts) then checks the
 * account is approved on every request (#119).
 */
export async function verifyAdminSession(token: string): Promise<{ handle: string } | null> {
  try {
    const secret = new TextEncoder().encode(config.adminSessionSecret);
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    return { handle: payload.sub };
  } catch {
    return null;
  }
}
