import {
  PASS_QR_PREFIX,
  canonicalPassPayload,
  passPayloadSchema,
  type PassKeysResponse,
  type PassPayload,
  type PassPublicKey,
  type PassResponse,
} from "@grad/contract";
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";

/**
 * Signs pass payloads with Ed25519 (#35). The signed bytes are the UTF-8 of
 * `canonicalPassPayload(payload)`; the signature is base64url without padding.
 * Key material is never logged or included in error messages.
 */
export class PassSigner {
  private readonly publicKey: KeyObject;

  constructor(
    private readonly privateKey: KeyObject,
    readonly keyId: string,
  ) {
    if (privateKey.asymmetricKeyType !== "ed25519") {
      throw new Error("PASS_SIGNING_KEY must be an Ed25519 private key");
    }
    if (!/^[A-Za-z0-9_-]+$/.test(keyId)) {
      throw new Error("PASS_KEY_ID may only contain letters, digits, '-' and '_'");
    }
    this.publicKey = createPublicKey(privateKey);
  }

  /** A signer with a fresh key that lives only as long as the process. */
  static ephemeral(keyId: string): PassSigner {
    return new PassSigner(generateKeyPairSync("ed25519").privateKey, keyId);
  }

  sign(payload: PassPayload): PassResponse {
    const bytes = Buffer.from(canonicalPassPayload(payload), "utf8");
    const signature = sign(null, bytes, this.privateKey).toString("base64url");
    return { payload, signature, keyId: this.keyId };
  }

  publicJwk(): PassPublicKey {
    const { x } = this.publicKey.export({ format: "jwk" });
    return { kty: "OKP", crv: "Ed25519", x: x!, kid: this.keyId, alg: "EdDSA", use: "sig" };
  }

  keys(): PassKeysResponse {
    return { keys: [this.publicJwk()] };
  }
}

/**
 * Parses `PASS_SIGNING_KEY`: a PKCS#8 PEM, the PEM with literal `\n` escapes, or
 * the base64 of either the PEM or its DER bytes.
 */
export function parseSigningKey(value: string): KeyObject {
  const text = value.trim().replace(/\\n/g, "\n");
  try {
    if (text.includes("-----BEGIN")) return createPrivateKey(text);
    const decoded = Buffer.from(text, "base64");
    const asText = decoded.toString("utf8");
    if (asText.includes("-----BEGIN")) return createPrivateKey(asText);
    return createPrivateKey({ key: decoded, format: "der", type: "pkcs8" });
  } catch {
    // The original error can quote the input; say only what went wrong.
    throw new Error("PASS_SIGNING_KEY is not a valid PKCS#8 private key (PEM or base64)");
  }
}

export interface SignerConfig {
  nodeEnv: string;
  pass: { signingKey?: string; keyId: string };
}

/**
 * Builds the signer from configuration. Without a key outside production it
 * falls back to an ephemeral key and warns; production refuses to start.
 */
export function signerFromConfig(config: SignerConfig, warn: (message: string) => void): PassSigner {
  const { signingKey, keyId } = config.pass;
  if (signingKey) return new PassSigner(parseSigningKey(signingKey), keyId);
  if (config.nodeEnv === "production") {
    throw new Error("Missing required environment variables: PASS_SIGNING_KEY");
  }
  warn(
    "PASS_SIGNING_KEY is not set: signing passes with an ephemeral Ed25519 key; " +
      "passes will not verify after a restart",
  );
  return PassSigner.ephemeral(keyId);
}

export type VerifyResult =
  | { ok: true; keyId: string; payload: PassPayload }
  | { ok: false; reason: "format" | "unknown-key" | "signature" | "payload" };

/**
 * Reference offline verifier for the QR text produced by `encodePassQr`. Needs
 * only the published keys (GET /pass/keys). Checks the signature over the
 * embedded bytes before parsing them; validity windows are left to the caller.
 */
export function verifyPassQr(text: string, keys: PassKeysResponse): VerifyResult {
  const parts = text.split(".");
  if (parts.length !== 4 || parts[0] !== PASS_QR_PREFIX) return { ok: false, reason: "format" };
  const [, keyId, body, signature] = parts as [string, string, string, string];
  // Node's base64url decoder is lenient; insist on the canonical encoding.
  if (!isCanonicalBase64Url(body) || !isCanonicalBase64Url(signature)) {
    return { ok: false, reason: "format" };
  }

  const jwk = keys.keys.find((key) => key.kid === keyId);
  if (!jwk) return { ok: false, reason: "unknown-key" };

  const bytes = Buffer.from(body, "base64url");
  const publicKey = createPublicKey({ key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x }, format: "jwk" });
  if (!verify(null, bytes, publicKey, Buffer.from(signature, "base64url"))) {
    return { ok: false, reason: "signature" };
  }

  try {
    const payload = passPayloadSchema.parse(JSON.parse(bytes.toString("utf8")));
    return { ok: true, keyId, payload };
  } catch {
    return { ok: false, reason: "payload" };
  }
}

function isCanonicalBase64Url(value: string): boolean {
  return value.length > 0 && Buffer.from(value, "base64url").toString("base64url") === value;
}
