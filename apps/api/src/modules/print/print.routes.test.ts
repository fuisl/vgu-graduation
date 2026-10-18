import {
  adminPrintJobsResponseSchema,
  createPrintJobResponseSchema,
  nextPrintJobResponseSchema,
  type PrintJob,
} from "@grad/contract";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import { buildServer } from "../../server.js";
import { approvedTester, fakeAdminAccounts } from "../admin/admin-accounts.fake.js";
import type { CreatePrintResult, PrintRequester, PrintService } from "./print.service.js";

const config = loadConfig({ LOG_LEVEL: "silent", SERVICE_TOKEN_PRINTER: "printer-secret", SERVICE_TOKEN_TRANSLATION: "translation-secret" });
const JOB_ID = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";
const TOKEN = "guest-bearer-token-value";
const job: PrintJob = { id: JOB_ID, photoPublicId: "pub1", copies: 1, status: "queued", createdAt: "2026-11-20T03:00:00.000Z" };
const printer = { authorization: "Bearer printer-secret" };

async function adminHeaders(handle = "tester") {
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(handle)
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(config.adminSessionSecret));
  return { authorization: `Bearer ${jwt}` };
}

function build(overrides: Partial<Record<keyof PrintService, unknown>> = {}, adminAccounts = approvedTester()) {
  const created: [PrintRequester, unknown][] = [];
  const service = {
    create: async (requester: PrintRequester, dto: unknown): Promise<CreatePrintResult> => {
      created.push([requester, dto]);
      return { status: "ok", job };
    },
    claimNext: async () => ({
      ...job,
      status: "printing",
      imageUrl: "http://localhost:4000/media/pub1/display",
      variant: "display",
      attempt: 1,
      leaseExpiresAt: "2026-11-20T03:05:00.000Z",
    }),
    complete: async () => ({ status: "ok", job: { ...job, status: "done" } }),
    retry: async () => ({ status: "not_found" }),
    list: async () => ({ items: [], nextCursor: null, counts: { queued: 0, printing: 0, done: 0, failed: 0 } }),
    ...overrides,
  } as unknown as PrintService;
  return { app: buildServer({ adminAccounts, config, printService: service }), created };
}

describe("POST /print/jobs", () => {
  it("needs a credential", async () => {
    const { app } = build();
    expect((await app.inject({ method: "POST", url: "/print/jobs", payload: { photoPublicId: "pub1" } })).statusCode).toBe(401);
  });

  it("queues as an approved admin, with any copies and no-store", async () => {
    const { app, created } = build();
    const res = await app.inject({ method: "POST", url: "/print/jobs", headers: await adminHeaders(), payload: { photoPublicId: "pub1", copies: 3 } });
    expect(res.statusCode).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(createPrintJobResponseSchema.safeParse(res.json()).success).toBe(true);
    expect(created).toEqual([[{ kind: "admin", handle: "tester" }, { photoPublicId: "pub1", copies: 3 }]]);
  });

  it("refuses an admin session whose account isn't approved", async () => {
    const { app, created } = build({}, fakeAdminAccounts({ tester: "pending" }).store);
    const res = await app.inject({ method: "POST", url: "/print/jobs", headers: await adminHeaders(), payload: { photoPublicId: "pub1" } });
    expect(res.statusCode).toBe(403);
    expect(created).toEqual([]);
  });

  it("treats any other bearer or the inv cookie as a guest credential", async () => {
    const { app, created } = build();
    await app.inject({ method: "POST", url: "/print/jobs", headers: { authorization: `Bearer ${TOKEN}` }, payload: { photoPublicId: "pub1" } });
    await app.inject({ method: "POST", url: "/print/jobs", headers: { cookie: `inv=${TOKEN}` }, payload: { photoPublicId: "pub1" } });
    expect(created.map(([who]) => who)).toEqual([
      { kind: "guest", token: TOKEN },
      { kind: "guest", token: TOKEN },
    ]);
  });

  it.each([
    [{ status: "guest_disabled" }, 403],
    [{ status: "invalid" }, 404],
    [{ status: "expired" }, 410],
    [{ status: "too_many_copies" }, 400],
    [{ status: "photo_not_found" }, 404],
    [{ status: "photo_not_printable" }, 409],
  ] as const)("maps %o to %i", async (result, code) => {
    const { app } = build({ create: async () => result });
    const res = await app.inject({ method: "POST", url: "/print/jobs", headers: { cookie: `inv=${TOKEN}` }, payload: { photoPublicId: "pub1" } });
    expect(res.statusCode).toBe(code);
    expect(Object.keys(res.json())).toEqual(["error", "message"]);
  });

  it("answers 429 with Retry-After over the guest limit", async () => {
    const { app } = build({ create: async () => ({ status: "rate_limited", retryAfterSeconds: 3600 }) });
    const res = await app.inject({ method: "POST", url: "/print/jobs", headers: { cookie: `inv=${TOKEN}` }, payload: { photoPublicId: "pub1" } });
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBe("3600");
  });

  it("validates the body", async () => {
    const { app } = build();
    const headers = await adminHeaders();
    expect((await app.inject({ method: "POST", url: "/print/jobs", headers, payload: { photoPublicId: "pub1", copies: 9 } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/print/jobs", headers, payload: {} })).statusCode).toBe(400);
  });

  it("never logs the guest token", async () => {
    const lines: string[] = [];
    const service = { create: async () => ({ status: "ok", job }) } as unknown as PrintService;
    const app = buildServer({
      adminAccounts: approvedTester(),
      config: { ...config, logLevel: "trace" },
      logStream: { write: (line) => void lines.push(line) },
      printService: service,
    });
    await app.inject({ method: "POST", url: "/print/jobs", headers: { authorization: `Bearer ${TOKEN}` }, payload: { photoPublicId: "pub1" } });
    await app.close();
    expect(lines.join("")).toContain("print job queued");
    expect(lines.join("")).not.toContain(TOKEN);
  });
});

describe("printer daemon routes", () => {
  it("only the printer token opens them", async () => {
    const { app } = build();
    expect((await app.inject({ method: "GET", url: "/internal/print/jobs/next" })).statusCode).toBe(401);
    const wrong = await app.inject({ method: "GET", url: "/internal/print/jobs/next", headers: { authorization: "Bearer translation-secret" } });
    expect(wrong.statusCode).toBe(401);
    const admin = await app.inject({ method: "GET", url: "/internal/print/jobs/next", headers: await adminHeaders() });
    expect(admin.statusCode).toBe(401);
    const done = await app.inject({ method: "POST", url: `/internal/print/jobs/${JOB_ID}/done`, payload: { result: "done" } });
    expect(done.statusCode).toBe(401);
  });

  it("hands out the next job with its fetch URL, or null", async () => {
    const { app } = build();
    const res = await app.inject({ method: "GET", url: "/internal/print/jobs/next", headers: printer });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(nextPrintJobResponseSchema.parse(res.json()).job?.imageUrl).toBe("http://localhost:4000/media/pub1/display");

    const empty = build({ claimNext: async () => null });
    expect((await empty.app.inject({ method: "GET", url: "/internal/print/jobs/next", headers: printer })).json()).toEqual({ job: null });
  });

  it("records a report and maps conflicts and unknown jobs", async () => {
    const { app } = build();
    const ok = await app.inject({ method: "POST", url: `/internal/print/jobs/${JOB_ID}/done`, headers: printer, payload: { result: "done" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().status).toBe("done");

    const conflict = build({ complete: async () => ({ status: "conflict", current: "failed" }) });
    const res = await conflict.app.inject({ method: "POST", url: `/internal/print/jobs/${JOB_ID}/done`, headers: printer, payload: { result: "done" } });
    expect(res.statusCode).toBe(409);
    const missing = build({ complete: async () => ({ status: "not_found" }) });
    expect(
      (await missing.app.inject({ method: "POST", url: `/internal/print/jobs/${JOB_ID}/done`, headers: printer, payload: { result: "failed", error: "jam" } }))
        .statusCode,
    ).toBe(404);
    expect((await app.inject({ method: "POST", url: "/internal/print/jobs/42/done", headers: printer, payload: { result: "done" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: `/internal/print/jobs/${JOB_ID}/done`, headers: printer, payload: { result: "queued" } })).statusCode).toBe(400);
  });

  it("fails closed when no printer token is configured", async () => {
    const app = buildServer({ adminAccounts: approvedTester(), config: loadConfig({ LOG_LEVEL: "silent" }), printService: {} as PrintService });
    expect((await app.inject({ method: "GET", url: "/internal/print/jobs/next", headers: printer })).statusCode).toBe(401);
  });
});

describe("admin print routes", () => {
  it("lists the queue for admins only", async () => {
    const { app } = build();
    expect((await app.inject({ method: "GET", url: "/admin/print/jobs" })).statusCode).toBe(401);
    const res = await app.inject({ method: "GET", url: "/admin/print/jobs?status=failed", headers: await adminHeaders() });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(adminPrintJobsResponseSchema.safeParse(res.json()).success).toBe(true);
    expect((await app.inject({ method: "GET", url: "/admin/print/jobs?status=lost", headers: await adminHeaders() })).statusCode).toBe(400);
  });

  it("retries a failed job and maps conflicts", async () => {
    const { app } = build({ retry: async () => ({ status: "conflict", current: "done" }) });
    const res = await app.inject({ method: "POST", url: `/admin/print/jobs/${JOB_ID}/retry`, headers: await adminHeaders() });
    expect(res.statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: `/admin/print/jobs/${JOB_ID}/retry` })).statusCode).toBe(401);
  });
});
