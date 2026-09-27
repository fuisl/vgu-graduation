import { jwtVerify, SignJWT } from "jose";

const ADMIN_SESSION_TTL_SECONDS = 60 * 60; // 1 hour, per docs/architecture/target/use-cases.md §6.4 "short-lived"

function secretKey() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

/** Mints the session token apps/api independently verifies with the same shared secret. */
export async function mintAdminSession(githubHandle: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(githubHandle)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL_SECONDS)
    .sign(secretKey());
}

export async function verifyAdminSession(token: string): Promise<{ handle: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    return { handle: payload.sub };
  } catch {
    return null;
  }
}
