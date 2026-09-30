import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { runMigrations } from "../migrate.js";
import { JobQueue } from "./queue.js";

/**
 * Real-Postgres check of the job queue, in its own scratch database (never the
 * shared grad26 data). Skips locally when Postgres is unreachable.
 */
const baseUrl = new URL(loadConfig(process.env).databaseUrl);
const adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";
const scratchName = `grad_jobs_test_${process.pid}`;
const scratchUrl = new URL(baseUrl);
scratchUrl.pathname = `/${scratchName}`;

let admin: pg.Client | undefined;
let pool: pg.Pool;

beforeAll(async () => {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
  } catch (err) {
    if (process.env.CI) throw err;
    console.warn("Postgres unreachable, skipping job queue DB tests (run `pnpm db:up`)");
    return;
  }
  admin = client;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName}`);
  await admin.query(`CREATE DATABASE ${scratchName}`);
  await runMigrations(scratchUrl.toString());
  pool = new pg.Pool({ connectionString: scratchUrl.toString(), max: 20 });
  // Idle connections dropped by DROP DATABASE ... FORCE would otherwise crash the run.
  pool.on("error", () => {});
});

afterAll(async () => {
  await pool?.end();
  if (!admin) return;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.end();
});

beforeEach(async (ctx) => {
  if (!admin) return ctx.skip();
  await pool.query("TRUNCATE jobs");
});

const statusOf = async (id: string) =>
  (await pool.query("SELECT status, attempts, last_error, locked_by FROM jobs WHERE id = $1", [id])).rows[0];

describe("JobQueue", () => {
  it("never hands the same job to two concurrent workers", async () => {
    const queue = new JobQueue(pool);
    const ids = await Promise.all(Array.from({ length: 30 }, (_, i) => queue.enqueue("demo", { n: i })));

    const claimed: string[] = [];
    await Promise.all(
      Array.from({ length: 8 }, async (_, w) => {
        for (;;) {
          const job = await queue.claim(`w${w}`);
          if (!job) return;
          claimed.push(job.id);
          await queue.complete(job, `w${w}`);
        }
      }),
    );

    expect(claimed.sort()).toEqual([...ids].sort());
    const { rows } = await pool.query("SELECT DISTINCT status, attempts FROM jobs");
    expect(rows).toEqual([{ status: "succeeded", attempts: 1 }]);
  });

  it("does not claim a job before its run_at", async () => {
    const queue = new JobQueue(pool);
    await queue.enqueue("demo", {}, { runAt: new Date(Date.now() + 60_000) });
    expect(await queue.claim("w1")).toBeNull();
  });

  it("re-queues a failed attempt with backoff, then leaves it failed and visible", async () => {
    const queue = new JobQueue(pool);
    const id = await queue.enqueue("demo", {}, { maxAttempts: 2 });

    const first = (await queue.claim("w1"))!;
    await queue.fail(first, "w1", new Error("first"));
    expect(await statusOf(id)).toMatchObject({ status: "queued", attempts: 1, last_error: "first", locked_by: null });
    // Backoff keeps it out of reach until run_at passes.
    expect(await queue.claim("w1")).toBeNull();

    await pool.query("UPDATE jobs SET run_at = now() WHERE id = $1", [id]);
    const second = (await queue.claim("w1"))!;
    expect(second.attempts).toBe(2);
    await queue.fail(second, "w1", new Error("second"));
    expect(await statusOf(id)).toMatchObject({ status: "failed", attempts: 2, last_error: "second" });
    expect(await queue.claim("w1")).toBeNull();
  });

  it("re-claims a job orphaned by a dead worker once its lease expires, and ignores the stale owner", async () => {
    const queue = new JobQueue(pool, 60_000);
    const id = await queue.enqueue("demo");
    const orphaned = (await queue.claim("dead"))!;

    expect(await queue.claim("w2")).toBeNull();
    await pool.query("UPDATE jobs SET locked_at = now() - interval '2 minutes' WHERE id = $1", [id]);
    const reclaimed = (await queue.claim("w2"))!;
    expect(reclaimed).toMatchObject({ id, attempts: 2 });

    // The original worker finishing late must not overwrite the new owner's run.
    await queue.complete(orphaned, "dead");
    expect(await statusOf(id)).toMatchObject({ status: "running", locked_by: "w2" });
    await queue.complete(reclaimed, "w2");
    expect(await statusOf(id)).toMatchObject({ status: "succeeded" });
  });
});
