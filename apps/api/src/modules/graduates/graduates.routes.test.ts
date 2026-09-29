import { graduateSchema, graduatesResponseSchema } from "@grad/contract";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import { buildServer } from "../../server.js";
import { DuplicateGraduateError } from "./graduates.repository.js";
import type { GraduatesService } from "./graduates.service.js";

const config = loadConfig({ LOG_LEVEL: "silent" });
const graduate = {
  id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
  name: "Ann Nguyen",
  email: "ann@example.com",
  createdAt: "2026-10-01T00:00:00.000Z",
};

async function adminHeaders() {
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("tester")
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(config.adminSessionSecret));
  return { authorization: `Bearer ${jwt}` };
}

function build(overrides: Partial<Record<keyof GraduatesService, unknown>> = {}) {
  const created: unknown[][] = [];
  const service = {
    listGraduates: async () => ({ items: [graduate] }),
    createGraduate: async (...args: unknown[]) => {
      created.push(args);
      return graduate;
    },
    ...overrides,
  } as unknown as GraduatesService;
  return { app: buildServer({ config, graduatesService: service }), created };
}

describe("GET /admin/graduates", () => {
  it("requires an admin session", async () => {
    const { app } = build();
    expect((await app.inject({ method: "GET", url: "/admin/graduates" })).statusCode).toBe(401);
  });

  it("returns the list, uncached", async () => {
    const { app } = build();
    const res = await app.inject({ method: "GET", url: "/admin/graduates", headers: await adminHeaders() });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(graduatesResponseSchema.safeParse(res.json()).success).toBe(true);
  });
});

describe("POST /admin/graduates", () => {
  const payload = { name: "  Ann Nguyen ", email: "Ann@Example.com" };

  it("requires an admin session", async () => {
    const { app } = build();
    expect((await app.inject({ method: "POST", url: "/admin/graduates", payload })).statusCode).toBe(401);
  });

  it("creates with a normalised body and the admin handle as actor", async () => {
    const { app, created } = build();
    const res = await app.inject({ method: "POST", url: "/admin/graduates", headers: await adminHeaders(), payload });
    expect(res.statusCode).toBe(201);
    expect(graduateSchema.safeParse(res.json()).success).toBe(true);
    expect(created).toEqual([[{ name: "Ann Nguyen", email: "ann@example.com" }, "tester"]]);
  });

  it("rejects an invalid body", async () => {
    const { app } = build();
    const res = await app.inject({
      method: "POST",
      url: "/admin/graduates",
      headers: await adminHeaders(),
      payload: { name: "", email: "not-an-email" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 409 for a duplicate email", async () => {
    const { app } = build({
      createGraduate: async () => {
        throw new DuplicateGraduateError();
      },
    });
    const res = await app.inject({ method: "POST", url: "/admin/graduates", headers: await adminHeaders(), payload });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: "Conflict" });
  });
});
