import { describe, expect, it } from "vitest";
import {
  canonicalPassPayload,
  encodePassQr,
  passKeysResponseSchema,
  type PassPayload,
} from "./index.js";

const payload: PassPayload = {
  v: 1,
  invitationId: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
  guestName: "Nguyễn Thị Ánh 🎓",
  validFrom: null,
  validUntil: "2026-11-16T00:00:00.000Z",
};

// Fixed vectors, computed independently with Node's Buffer (UTF-8, base64url).
const CANONICAL =
  '{"v":1,"invitationId":"3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f","guestName":"Nguyễn Thị Ánh 🎓","validFrom":null,"validUntil":"2026-11-16T00:00:00.000Z"}';
const CANONICAL_B64URL =
  "eyJ2IjoxLCJpbnZpdGF0aW9uSWQiOiIzZjJlOGIxYS05YzNkLTRjOWEtOGIxZS0xYTJiM2M0ZDVlNmYiLCJndWVzdE5hbWUiOiJOZ3V54buFbiBUaOG7iyDDgW5oIPCfjpMiLCJ2YWxpZEZyb20iOm51bGwsInZhbGlkVW50aWwiOiIyMDI2LTExLTE2VDAwOjAwOjAwLjAwMFoifQ";

describe("pass encoding", () => {
  it("canonicalizes with a fixed key order regardless of input order and extra keys", () => {
    const shuffled = {
      validUntil: payload.validUntil,
      guestName: payload.guestName,
      extra: "dropped",
      validFrom: null,
      invitationId: payload.invitationId,
      v: 1,
    } as unknown as PassPayload;
    expect(canonicalPassPayload(shuffled)).toBe(CANONICAL);
  });

  it("encodes the QR text with the signed bytes as base64url (multi-byte UTF-8 included)", () => {
    expect(encodePassQr({ payload, signature: "sig", keyId: "pass-1" })).toBe(
      `GP1.pass-1.${CANONICAL_B64URL}.sig`,
    );
  });

  it("handles every base64 tail length without padding", () => {
    const name = (guestName: string) =>
      encodePassQr({ payload: { ...payload, guestName }, signature: "s", keyId: "k" }).split(".")[2];
    expect(new Set([name("a"), name("ab"), name("abc")].map((s) => s!.includes("=")))).toEqual(new Set([false]));
  });

  it("rejects a keyId that would break the dot-separated format", () => {
    expect(() => encodePassQr({ payload, signature: "s", keyId: "a.b" })).toThrow();
  });
});

describe("pass keys", () => {
  const key = {
    kty: "OKP",
    crv: "Ed25519",
    x: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
    kid: "pass-1",
    alg: "EdDSA",
    use: "sig",
  };

  it("accepts an Ed25519 JWK Set", () => {
    expect(passKeysResponseSchema.safeParse({ keys: [key] }).success).toBe(true);
  });

  it("rejects other key types and private members are stripped", () => {
    expect(passKeysResponseSchema.safeParse({ keys: [{ ...key, crv: "P-256" }] }).success).toBe(false);
    const parsed = passKeysResponseSchema.parse({ keys: [{ ...key, d: "private" }] });
    expect(parsed.keys[0]).not.toHaveProperty("d");
  });
});
