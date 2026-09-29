import { encodePassQr, passKeysResponseSchema, passResponseSchema } from "@grad/contract";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import { buildServer } from "../../server.js";
import type { InvitationsService, ResolveResult } from "../invitations/invitations.service.js";
import { PassSigner, verifyPassQr } from "./pass.signer.js";

const config = loadConfig({ LOG_LEVEL: "silent" });
const TOKEN = "guest-bearer-token-value";

const invitation = {
  id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
  guest: {
    id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70",
    name: "Jane Guest",
    email: "jane@example.com",
    phone: "+84 912 345 678",
  },
  maxPlusOnes: 1,
  status: "active" as const,
  validFrom: null,
  validUntil: "2026-11-16T00:00:00.000Z",
  inviters: [{ id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e72", name: "Grad", email: "grad@example.com" }],
  rsvp: null,
};

function invitationsWith(resolve: (token: string) => ResolveResult) {
  return { resolveByToken: async (token: string) => resolve(token) } as unknown as InvitationsService;
}

const okFor = (token: string): ResolveResult =>
  token === TOKEN ? { status: "ok", invitation } : { status: "invalid" };

function server(resolve: (token: string) => ResolveResult = okFor, signer = PassSigner.ephemeral("pass-1")) {
  return { app: buildServer({ config, invitationsService: invitationsWith(resolve), passSigner: signer }), signer };
}

describe("GET /pass", () => {
  it("returns 401 with no credential", async () => {
    const { app } = server();
    const res = await app.inject({ method: "GET", url: "/pass" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: "Unauthorized" });
  });

  it("returns 404 for a wrong or revoked token", async () => {
    const { app } = server();
    const res = await app.inject({ method: "GET", url: "/pass", headers: { authorization: "Bearer wrong" } });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Not Found", message: "Invalid or revoked invitation" });
  });

  it("returns 410 for an expired invitation", async () => {
    const { app } = server(() => ({ status: "expired" }));
    const res = await app.inject({ method: "GET", url: "/pass", headers: { authorization: `Bearer ${TOKEN}` } });
    expect(res.statusCode).toBe(410);
    expect(res.json()).toEqual({ error: "Gone", message: "This invitation has expired" });
  });

  it("returns a contract-shaped pass that verifies with the published keys", async () => {
    const { app } = server();
    const res = await app.inject({ method: "GET", url: "/pass", headers: { cookie: `inv=${TOKEN}` } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    const pass = passResponseSchema.parse(res.json());

    const keysRes = await app.inject({ method: "GET", url: "/pass/keys" });
    const keys = passKeysResponseSchema.parse(keysRes.json());
    expect(verifyPassQr(encodePassQr(pass), keys)).toMatchObject({ ok: true, keyId: "pass-1" });
  });

  it("puts no PII beyond the guest name in the payload", async () => {
    const { app } = server();
    const res = await app.inject({ method: "GET", url: "/pass", headers: { authorization: `Bearer ${TOKEN}` } });
    const body = res.json();
    expect(body.payload).toEqual({
      v: 1,
      invitationId: invitation.id,
      guestName: "Jane Guest",
      validFrom: null,
      validUntil: "2026-11-16T00:00:00.000Z",
    });
    for (const secret of [TOKEN, invitation.guest.email, invitation.guest.phone, "grad@example.com", invitation.guest.id]) {
      expect(res.body).not.toContain(secret);
    }
  });
});

describe("GET /pass/keys", () => {
  it("publishes the signer's public key as a cacheable JWK Set", async () => {
    const { app, signer } = server();
    const res = await app.inject({ method: "GET", url: "/pass/keys" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=300");
    expect(res.json()).toEqual({ keys: [signer.publicJwk()] });
    expect(res.body).not.toContain('"d"');
  });

  it("builds an ephemeral dev key from config and warns without logging key material", async () => {
    const lines: string[] = [];
    const app = buildServer({
      config: { ...config, logLevel: "warn", nodeEnv: "development", pass: { signingKey: undefined, keyId: "pass-dev" } },
      logStream: { write: (line) => void lines.push(line) },
      invitationsService: invitationsWith(okFor),
    });
    const res = await app.inject({ method: "GET", url: "/pass/keys" });
    const [key] = passKeysResponseSchema.parse(res.json()).keys;
    expect(key!.kid).toBe("pass-dev");
    const output = lines.join("");
    expect(output).toContain("ephemeral");
    expect(output).not.toContain(key!.x);
    expect(output).not.toContain("PRIVATE KEY");
  });
});

describe("token hygiene in logs", () => {
  it("never writes the token, key or guest details to the log", async () => {
    const lines: string[] = [];
    const signer = PassSigner.ephemeral("pass-1");
    const app = buildServer({
      config: { ...config, logLevel: "trace" },
      logStream: { write: (line) => void lines.push(line) },
      invitationsService: invitationsWith(okFor),
      passSigner: signer,
    });
    const res = await app.inject({ method: "GET", url: "/pass", headers: { authorization: `Bearer ${TOKEN}` } });
    await app.inject({ method: "GET", url: "/pass", headers: { cookie: `inv=${TOKEN}` } });
    await app.inject({ method: "GET", url: "/pass", headers: { authorization: "Bearer wrong-token-xyz" } });
    await app.close();

    const output = lines.join("");
    expect(output).toContain("/pass");
    for (const secret of [TOKEN, "wrong-token-xyz", "Jane Guest", invitation.guest.email, res.json().signature]) {
      expect(output).not.toContain(secret);
    }
  });
});
