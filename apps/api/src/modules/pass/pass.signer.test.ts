import { canonicalPassPayload, encodePassQr, type PassPayload } from "@grad/contract";
import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PassSigner, parseSigningKey, signerFromConfig, verifyPassQr } from "./pass.signer.js";

const payload: PassPayload = {
  v: 1,
  invitationId: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
  guestName: "Nguyễn Thị Ánh",
  validFrom: "2026-11-01T00:00:00.000Z",
  validUntil: "2026-11-16T00:00:00.000Z",
};

/** Test keys are generated per run; no key material lives in the repository. */
function freshKeyPem(): string {
  const { privateKey } = generateKeyPairSync("ed25519");
  return privateKey.export({ format: "pem", type: "pkcs8" }).toString();
}

describe("PassSigner", () => {
  it("round-trips through the QR text using only the published public key", () => {
    const signer = new PassSigner(parseSigningKey(freshKeyPem()), "pass-1");
    const qr = encodePassQr(signer.sign(payload));
    const keys = JSON.parse(JSON.stringify(signer.keys())); // as fetched over the network
    expect(verifyPassQr(qr, keys)).toEqual({ ok: true, keyId: "pass-1", payload });
  });

  it("signs exactly the UTF-8 bytes of the canonical JSON", () => {
    const signer = PassSigner.ephemeral("pass-1");
    const { signature } = signer.sign(payload);
    const publicKey = createPublicKey({ key: signer.publicJwk(), format: "jwk" });
    const bytes = Buffer.from(canonicalPassPayload(payload), "utf8");
    expect(verify(null, bytes, publicKey, Buffer.from(signature, "base64url"))).toBe(true);
    expect(signature).toMatch(/^[A-Za-z0-9_-]{86}$/);
  });

  it.each(Object.keys(payload) as (keyof PassPayload)[])("fails verification when %s is tampered with", (field) => {
    const signer = PassSigner.ephemeral("pass-1");
    const pass = signer.sign(payload);
    const tampered = {
      ...pass,
      payload: {
        ...pass.payload,
        [field]:
          field === "v"
            ? 2
            : field === "invitationId"
              ? "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70"
              : field === "guestName"
                ? "Nguyen Thi Anh"
                : "2027-01-01T00:00:00.000Z",
      },
    } as typeof pass;
    expect(verifyPassQr(encodePassQr(tampered), signer.keys())).toEqual({ ok: false, reason: "signature" });
  });

  it("fails verification for a tampered signature or a non-canonical encoding", () => {
    const signer = PassSigner.ephemeral("pass-1");
    const qr = encodePassQr(signer.sign(payload));
    const [prefix, kid, body, sig] = qr.split(".") as [string, string, string, string];
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    expect(verifyPassQr([prefix, kid, body, flipped].join("."), signer.keys()).ok).toBe(false);
    expect(verifyPassQr([prefix, kid, body, `${sig}=`].join("."), signer.keys())).toEqual({ ok: false, reason: "format" });
    expect(verifyPassQr(`GP2.${kid}.${body}.${sig}`, signer.keys())).toEqual({ ok: false, reason: "format" });
  });

  it("rejects an unknown keyId and a key that did not sign the pass", () => {
    const signer = PassSigner.ephemeral("pass-1");
    const other = PassSigner.ephemeral("pass-1");
    const qr = encodePassQr(signer.sign(payload));
    expect(verifyPassQr(qr, PassSigner.ephemeral("pass-2").keys())).toEqual({ ok: false, reason: "unknown-key" });
    expect(verifyPassQr(qr, other.keys())).toEqual({ ok: false, reason: "signature" });
    // Relabelling the keyId in the QR does not help: the signature is still checked with that key.
    const relabelled = qr.replace("GP1.pass-1.", "GP1.pass-2.");
    expect(verifyPassQr(relabelled, PassSigner.ephemeral("pass-2").keys())).toEqual({ ok: false, reason: "signature" });
  });

  it("publishes only the public half of the key", () => {
    const jwk = PassSigner.ephemeral("pass-1").publicJwk();
    expect(Object.keys(jwk).sort()).toEqual(["alg", "crv", "kid", "kty", "use", "x"]);
  });
});

describe("parseSigningKey", () => {
  it("accepts PKCS#8 PEM, PEM with escaped newlines, base64 PEM and base64 DER", () => {
    const pem = freshKeyPem();
    const der = parseSigningKey(pem).export({ format: "der", type: "pkcs8" });
    const expected = createPublicKey(parseSigningKey(pem)).export({ format: "jwk" }).x;
    for (const value of [
      pem,
      pem.replace(/\n/g, "\\n"),
      Buffer.from(pem).toString("base64"),
      der.toString("base64"),
    ]) {
      expect(createPublicKey(parseSigningKey(value)).export({ format: "jwk" }).x).toBe(expected);
    }
  });

  it("rejects garbage without echoing it", () => {
    expect(() => parseSigningKey("not-a-key-secret-material")).toThrow(/^PASS_SIGNING_KEY is not a valid/);
    try {
      parseSigningKey("not-a-key-secret-material");
    } catch (error) {
      expect(String(error)).not.toContain("secret-material");
    }
  });

  it("rejects a non-Ed25519 key", () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    expect(() => new PassSigner(parseSigningKey(pem), "pass-1")).toThrow(/Ed25519/);
  });
});

describe("signerFromConfig", () => {
  it("uses the configured key", () => {
    const pem = freshKeyPem();
    const warnings: string[] = [];
    const signer = signerFromConfig(
      { nodeEnv: "production", pass: { signingKey: pem, keyId: "pass-7" } },
      (m) => warnings.push(m),
    );
    const expected = createPublicKey(parseSigningKey(pem)).export({ format: "jwk" }).x;
    expect(signer.publicJwk()).toMatchObject({ kid: "pass-7", x: expected });
    expect(warnings).toEqual([]);
  });

  it("falls back to an ephemeral key in development and warns without key material", () => {
    const warnings: string[] = [];
    const a = signerFromConfig({ nodeEnv: "development", pass: { keyId: "pass-1" } }, (m) => warnings.push(m));
    const b = signerFromConfig({ nodeEnv: "development", pass: { keyId: "pass-1" } }, () => {});
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("ephemeral");
    expect(warnings[0]).not.toContain(a.publicJwk().x);
    expect(a.publicJwk().x).not.toBe(b.publicJwk().x);
    expect(verifyPassQr(encodePassQr(a.sign(payload)), a.keys()).ok).toBe(true);
  });

  it("refuses to run without a key in production", () => {
    expect(() => signerFromConfig({ nodeEnv: "production", pass: { keyId: "pass-1" } }, () => {})).toThrow(
      /PASS_SIGNING_KEY/,
    );
  });
});
