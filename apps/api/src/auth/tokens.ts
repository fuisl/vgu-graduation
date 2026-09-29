import crypto from "node:crypto";

/** 128-bit random bearer token, base64url. The raw value is shown once and never stored. */
export function generateToken(): string {
  return crypto.randomBytes(16).toString("base64url");
}

/** SHA-256 hex digest. Only this is persisted for invitation tokens. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time string comparison. Both sides are hashed first so the inputs to
 * `timingSafeEqual` always have equal length, which means neither the content
 * nor the length of the expected secret leaks through timing.
 */
export function safeEqual(a: string, b: string): boolean {
  return crypto.timingSafeEqual(
    crypto.createHash("sha256").update(a).digest(),
    crypto.createHash("sha256").update(b).digest(),
  );
}
