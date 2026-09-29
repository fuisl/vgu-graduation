import { z } from "zod";
import { timestampSchema } from "./common.js";

/**
 * The compact payload encoded in the pass QR code. Versioned so door scanners
 * can reject formats they don't understand. Deliberately holds no email, phone
 * or token: the QR is shown on screen and may be photographed.
 */
export const passPayloadSchema = z.object({
  v: z.literal(1),
  invitationId: z.string().uuid(),
  guestName: z.string().min(1),
  validFrom: timestampSchema.nullable(),
  validUntil: timestampSchema.nullable(),
});
export type PassPayload = z.infer<typeof passPayloadSchema>;

/**
 * GET /pass: the payload plus its Ed25519 signature (base64url, no padding) over
 * the UTF-8 bytes of `canonicalPassPayload(payload)`, verified offline with the
 * key from GET /pass/keys whose `kid` equals `keyId`. Render `encodePassQr(pass)`
 * as the QR. Scheme: docs/architecture/target/use-cases.md §6.1.
 */
export const passResponseSchema = z.object({
  payload: passPayloadSchema,
  signature: z.string().min(1),
  keyId: z.string().min(1),
});
export type PassResponse = z.infer<typeof passResponseSchema>;

/**
 * One Ed25519 public key as a JWK (RFC 8037): `x` is the base64url raw 32-byte
 * key and `kid` matches the `keyId` of the passes it verifies.
 */
export const passPublicKeySchema = z.object({
  kty: z.literal("OKP"),
  crv: z.literal("Ed25519"),
  x: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  kid: z.string().min(1),
  alg: z.literal("EdDSA"),
  use: z.literal("sig"),
});
export type PassPublicKey = z.infer<typeof passPublicKeySchema>;

/** GET /pass/keys: the public keys a verifier may need, as a JWK Set. */
export const passKeysResponseSchema = z.object({
  keys: z.array(passPublicKeySchema),
});
export type PassKeysResponse = z.infer<typeof passKeysResponseSchema>;

/** First segment of the QR text; changes together with `v` if the encoding changes. */
export const PASS_QR_PREFIX = "GP1";

/**
 * The exact string whose UTF-8 bytes are signed: `JSON.stringify` of the payload
 * with keys in this fixed order and no whitespace. Extra keys are dropped.
 */
export function canonicalPassPayload(payload: PassPayload): string {
  return JSON.stringify({
    v: payload.v,
    invitationId: payload.invitationId,
    guestName: payload.guestName,
    validFrom: payload.validFrom,
    validUntil: payload.validUntil,
  });
}

/**
 * The text encoded in the pass QR code:
 * `GP1.<keyId>.<base64url(UTF-8 of canonical payload)>.<signature>`, base64url
 * without padding. Carrying the signed bytes (not an object to re-encode) means a
 * verifier never reproduces the canonical JSON, and base64url keeps non-ASCII
 * guest names safe from scanners that misread byte-mode QR text.
 */
export function encodePassQr(pass: PassResponse): string {
  if (pass.keyId.includes(".")) throw new Error("keyId must not contain '.'");
  const body = base64UrlEncode(utf8Encode(canonicalPassPayload(pass.payload)));
  return `${PASS_QR_PREFIX}.${pass.keyId}.${body}.${pass.signature}`;
}

// Pure helpers so the contract needs no Node or DOM globals (Buffer, TextEncoder, btoa).

function utf8Encode(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const cp = char.codePointAt(0)!;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return bytes;
}

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function base64UrlEncode(bytes: number[]): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const remaining = bytes.length - i;
    out += B64URL[(n >> 18) & 63]! + B64URL[(n >> 12) & 63]!;
    if (remaining > 1) out += B64URL[(n >> 6) & 63]!;
    if (remaining > 2) out += B64URL[n & 63]!;
  }
  return out;
}
