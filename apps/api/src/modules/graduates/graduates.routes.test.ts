import { graduateSchema, graduatesResponseSchema } from "@grad/contract";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import { buildServer } from "../../server.js";
import { approvedTester } from "../admin/admin-accounts.fake.js";
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
  return { app: buildServer({ adminAccounts: approvedTester(), config, graduatesService: service }), created };
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

  it("passes given and family names through (#170)", async () => {
    const { app, created } = build();
    await app.inject({
      method: "POST",
      url: "/admin/graduates",
      headers: await adminHeaders(),
      payload: { ...payload, givenName: "Ann", familyName: "Nguyen" },
    });
    expect(created[0]?.[0]).toMatchObject({ givenName: "Ann", familyName: "Nguyen" });
  });
});

describe("PATCH /admin/graduates/:id", () => {
  const url = `/admin/graduates/${graduate.id}`;

  it("requires an admin session", async () => {
    const { app } = build();
    expect((await app.inject({ method: "PATCH", url, payload: { givenName: "Ann" } })).statusCode).toBe(401);
  });

  it("updates with a normalised body and the admin as actor", async () => {
    const calls: unknown[][] = [];
    const { app } = build({
      updateGraduate: async (...args: unknown[]) => {
        calls.push(args);
        return { ...graduate, givenName: "Ann", familyName: "Nguyen", nameReviewed: true };
      },
    });
    const res = await app.inject({ method: "PATCH", url, headers: await adminHeaders(), payload: { givenName: "Ann", email: "ANN@example.com " } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(graduateSchema.parse(res.json())).toMatchObject({ givenName: "Ann", nameReviewed: true });
    expect(calls).toEqual([[graduate.id, { givenName: "Ann", email: "ann@example.com" }, "tester"]]);
  });

  it("maps an empty body to 400, unknown to 404 and a taken email to 409", async () => {
    const headers = await adminHeaders();
    const { app } = build({ updateGraduate: async () => null });
    expect((await app.inject({ method: "PATCH", url, headers, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url, headers, payload: { name: "X" } })).statusCode).toBe(404);
    const taken = build({
      updateGraduate: async () => {
        throw new DuplicateGraduateError();
      },
    });
    expect((await taken.app.inject({ method: "PATCH", url, headers, payload: { email: "b@example.com" } })).statusCode).toBe(409);
  });
});
