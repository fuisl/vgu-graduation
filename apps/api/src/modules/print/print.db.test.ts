import crypto from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config.js";
import { runMigrations } from "../../migrate.js";

/**
 * Real-Postgres check of the print queue (#72), in its own scratch database
 * (never the shared grad26 data). Skips locally when Postgres is unreachable.
 */
const baseUrl = new URL(loadConfig(process.env).databaseUrl);
const adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";
const scratchName = `grad_print_test_${process.pid}`;
const scratchUrl = new URL(baseUrl);
scratchUrl.pathname = `/${scratchName}`;

let admin: pg.Client | undefined;
let pool: pg.Pool | undefined;
let Repo: typeof import("./print.repository.js").PrintRepository;
let repo: InstanceType<typeof Repo>;
let invitationId: string;

beforeAll(async () => {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
  } catch (err) {
    if (process.env.CI) throw err;
    console.warn("Postgres unreachable, skipping print DB tests (run `pnpm db:up`)");
    return;
  }
  admin = client;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName}`);
  await admin.query(`CREATE DATABASE ${scratchName}`);
  await runMigrations(scratchUrl.toString());

  // See invitations.db.test.ts: re-import config and the db module against the scratch database.
  process.env.DATABASE_URL = scratchUrl.toString();
  vi.resetModules();
  const dbModule = await import("../../db/index.js");
  const { config: scratchConfig } = await import("../../config.js");
  if (scratchConfig.databaseUrl !== scratchUrl.toString()) {
    throw new Error("refusing to run: the db module is not pointed at the scratch database");
  }
  pool = dbModule.pool;
  pool.removeAllListeners("error");
  pool.on("error", () => {});
  ({ PrintRepository: Repo } = await import("./print.repository.js"));
  repo = new Repo();
});

afterAll(async () => {
  await pool?.end();
  if (!admin) return;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.end();
});

beforeEach(async (ctx) => {
  if (!admin) return ctx.skip();
  await pool!.query("TRUNCATE print_jobs, photos, jobs, audit, invitations, guests CASCADE");
  const { rows: [guest] } = await pool!.query("INSERT INTO guests (name) VALUES ('Print Guest') RETURNING id");
  const { rows: [inv] } = await pool!.query(
    "INSERT INTO invitations (guest_id, token_hash) VALUES ($1, $2) RETURNING id",
    [guest.id, crypto.randomBytes(32).toString("hex")],
  );
  invitationId = inv.id;
});

/** A visible, ready photo; returns its row id and public id. */
async function photo(): Promise<{ id: string; publicId: string }> {
  const id = crypto.randomUUID();
  const publicId = crypto.randomBytes(16).toString("base64url");
  await pool!.query(
    `INSERT INTO photos (id, public_id, invitation_id, original_key, content_type, size_bytes, processing_status)
     VALUES ($1, $2, $3, $4, 'image/jpeg', 100, 'ready')`,
    [id, publicId, invitationId, id],
  );
  return { id, publicId };
}

async function queue(photoId: string, requestedByAdmin = "tester") {
  const result = await repo.create({ photoId, copies: 1, requestedByAdmin }, requestedByAdmin);
  if (result.status !== "ok") throw new Error("expected ok");
  return result.job;
}

describe("print queue (real Postgres)", () => {
  it("queues durably and audits the request without PII", async () => {
    const p = await photo();
    const job = await queue(p.id);
    expect(job).toMatchObject({ photoPublicId: p.publicId, status: "queued", attempts: 0, requestedByAdmin: "tester" });

    // A fresh repository (an API restart) sees the same queue.
    const claimed = await new Repo().claim(300, 3, "service:printer");
    expect(claimed?.id).toBe(job.id);

    const { rows } = await pool!.query("SELECT actor, action, target_id, metadata FROM audit WHERE action = 'print.create'");
    expect(rows).toEqual([
      { actor: "tester", action: "print.create", target_id: job.id, metadata: { photoId: p.id, copies: 1, requestedBy: "admin" } },
    ]);
    expect(JSON.stringify(rows)).not.toContain("Print Guest");
  });

  it("caps guest requests per invitation, even when they race", async () => {
    const p = await photo();
    const since = new Date(Date.now() - 3600_000);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => repo.create({ photoId: p.id, copies: 1, requestedByInvitationId: invitationId }, "guest", { max: 3, since })),
    );
    expect(results.filter((r) => r.status === "ok")).toHaveLength(3);
    expect(results.filter((r) => r.status === "rate_limited")).toHaveLength(3);
  });

  it("claims oldest first, and concurrent claims never share a job", async () => {
    const p = await photo();
    const first = await queue(p.id);
    await queue(p.id);
    await queue(p.id);
    const claims = await Promise.all(Array.from({ length: 5 }, () => repo.claim(300, 3, "service:printer")));
    const ids = claims.filter(Boolean).map((c) => c!.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toContain(first.id);
    expect(claims.filter((c) => c === null)).toHaveLength(2);
    expect(claims.find((c) => c)?.leaseExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("requeues a job whose lease ran out, then fails it after the last attempt", async () => {
    const p = await photo();
    const job = await queue(p.id);
    const expire = () => pool!.query("UPDATE print_jobs SET lease_expires_at = now() - interval '1 second' WHERE id = $1", [job.id]);

    expect((await repo.claim(300, 2, "service:printer"))?.attempts).toBe(1);
    expect(await repo.claim(300, 2, "service:printer")).toBeNull();
    await expire();
    await repo.expireLeases(2);
    const { rows: [requeued] } = await pool!.query("SELECT status, attempts FROM print_jobs WHERE id = $1", [job.id]);
    expect(requeued).toEqual({ status: "queued", attempts: 1 });

    expect((await repo.claim(300, 2, "service:printer"))?.attempts).toBe(2);
    await expire();
    expect(await repo.claim(300, 2, "service:printer")).toBeNull();
    const { rows: [failed] } = await pool!.query("SELECT status, error FROM print_jobs WHERE id = $1", [job.id]);
    expect(failed).toEqual({ status: "failed", error: "The printer did not confirm this job" });
  });

  it("skips and fails a job whose photo was hidden after it was queued", async () => {
    const hidden = await photo();
    const fine = await photo();
    const skipped = await queue(hidden.id);
    const next = await queue(fine.id);
    await pool!.query("UPDATE photos SET moderation_status = 'hidden' WHERE id = $1", [hidden.id]);
    expect((await repo.claim(300, 3, "service:printer"))?.id).toBe(next.id);
    const { rows: [row] } = await pool!.query("SELECT status, error FROM print_jobs WHERE id = $1", [skipped.id]);
    expect(row).toEqual({ status: "failed", error: "The photo is no longer available" });
  });

  it("records reports: done, repeats as no-ops, conflicts, late reports after a lease ran out", async () => {
    const p = await photo();
    const job = await queue(p.id);
    await repo.claim(300, 3, "service:printer");
    expect(await repo.complete(job.id, "done", undefined, "service:printer")).toMatchObject({ status: "ok", changed: true, job: { status: "done" } });
    expect(await repo.complete(job.id, "done", undefined, "service:printer")).toMatchObject({ status: "ok", changed: false });
    expect(await repo.complete(job.id, "failed", "jam", "service:printer")).toMatchObject({ status: "conflict" });
    expect(await repo.complete(crypto.randomUUID(), "done", undefined, "service:printer")).toEqual({ status: "not_found" });

    const late = await queue(p.id);
    await repo.claim(300, 3, "service:printer");
    await pool!.query("UPDATE print_jobs SET lease_expires_at = now() - interval '1 second' WHERE id = $1", [late.id]);
    await repo.expireLeases(3);
    expect(await repo.complete(late.id, "failed", "x".repeat(600), "service:printer")).toMatchObject({ status: "ok", job: { status: "failed" } });
    const { rows: [row] } = await pool!.query("SELECT char_length(error) AS n, completed_at IS NOT NULL AS completed FROM print_jobs WHERE id = $1", [late.id]);
    expect(row).toEqual({ n: 500, completed: true });

    const fresh = await queue(p.id);
    expect(await repo.complete(fresh.id, "done", undefined, "service:printer")).toMatchObject({ status: "conflict" });
    const { rows: audits } = await pool!.query("SELECT actor, metadata FROM audit WHERE action = 'print.complete' ORDER BY id");
    expect(audits).toEqual([
      { actor: "service:printer", metadata: { result: "done" } },
      { actor: "service:printer", metadata: { result: "failed" } },
    ]);
  });

  it("retries failed jobs only, and lists with counts", async () => {
    const p = await photo();
    const job = await queue(p.id);
    expect(await repo.retry(job.id, "tester")).toMatchObject({ status: "conflict" });
    await repo.claim(300, 3, "service:printer");
    await repo.complete(job.id, "failed", "paper jam", "service:printer");
    expect(await repo.retry(job.id, "tester")).toMatchObject({ status: "ok", job: { status: "queued", attempts: 0, error: null } });
    expect(await repo.retry(crypto.randomUUID(), "tester")).toEqual({ status: "not_found" });

    await queue(p.id);
    expect(await repo.counts()).toEqual({ queued: 2, printing: 0, done: 0, failed: 0 });
    const page = await repo.list({ limit: 1 });
    expect(page).toHaveLength(2);
    const rest = await repo.list({ limit: 1, cursor: page[0]!.id });
    expect(rest.map((j) => j.id)).not.toContain(page[0]!.id);
    expect(await repo.list({ limit: 10, status: "failed" })).toEqual([]);
  });
});
