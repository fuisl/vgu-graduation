import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "./config.js";
import { runMigrations } from "./migrate.js";

const EXPECTED_TABLES = [
  "admin_accounts",
  "audit",
  "event_config",
  "guests",
  "invitation_inviters",
  "invitations",
  "jobs",
  "photos",
  "rsvp",
  "translation_segments",
  "translation_texts",
  "users",
  "wishes",
];

const adminUrl = new URL(config.databaseUrl);
adminUrl.pathname = "/postgres";
const scratchName = `grad_migrate_test_${process.pid}`;
const scratchUrl = new URL(config.databaseUrl);
scratchUrl.pathname = `/${scratchName}`;

let admin: pg.Client | undefined;

beforeAll(async () => {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
  } catch (err) {
    // CI provides Postgres; locally `pnpm db:up` does. Skip quietly only when it's absent locally.
    if (process.env.CI) throw err;
    console.warn("Postgres unreachable, skipping migration tests (run `pnpm db:up`)");
    return;
  }
  admin = client;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName}`);
  await admin.query(`CREATE DATABASE ${scratchName}`);
});

afterAll(async () => {
  if (!admin) return;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.end();
});

async function query<T extends pg.QueryResultRow>(sql: string): Promise<T[]> {
  const client = new pg.Client({ connectionString: scratchUrl.toString() });
  await client.connect();
  try {
    return (await client.query<T>(sql)).rows;
  } finally {
    await client.end();
  }
}

describe("runMigrations", () => {
  it("applies on an empty database and is idempotent on re-run", async (ctx) => {
    if (!admin) return ctx.skip();

    await runMigrations(scratchUrl.toString());
    await runMigrations(scratchUrl.toString());

    const tables = await query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    expect(tables.map((t) => t.table_name)).toEqual(EXPECTED_TABLES);

    const applied = await query<{ count: string }>(
      "SELECT count(*) FROM drizzle.__drizzle_migrations",
    );
    expect(Number(applied[0].count)).toBe(5);

    // 0004 moves the untouched placeholder date to 20 November 2026 and bumps the calendar sequence once.
    const [event] = await query<{ epoch: string; sequence: number }>(
      "SELECT extract(epoch FROM starts_at)::bigint AS epoch, sequence FROM event_config WHERE id = 1",
    );
    expect(Number(event.epoch) * 1000).toBe(Date.parse("2026-11-20T09:00:00+07:00"));
    expect(event.sequence).toBe(1);
  });

  it("serializes concurrent runs", async (ctx) => {
    if (!admin) return ctx.skip();
    const concurrentName = `${scratchName}_concurrent`;
    await admin.query(`CREATE DATABASE ${concurrentName}`);
    const url = new URL(config.databaseUrl);
    url.pathname = `/${concurrentName}`;
    try {
      // Without the advisory lock these race on CREATE TABLE and some reject.
      await Promise.all(Array.from({ length: 6 }, () => runMigrations(url.toString())));
    } finally {
      await admin.query(`DROP DATABASE IF EXISTS ${concurrentName} WITH (FORCE)`);
    }
  });

  it("seeds exactly one placeholder event with an unconfirmed time", async (ctx) => {
    if (!admin) return ctx.skip();
    const rows = await query<{ id: number; time_confirmed: boolean }>("SELECT id, time_confirmed FROM event_config");
    expect(rows).toEqual([{ id: 1, time_confirmed: false }]);
  });

  it("seeds the four current collaborators as approved admins", async (ctx) => {
    if (!admin) return ctx.skip();
    const rows = await query<{ github_handle: string; status: string }>(
      "SELECT github_handle, status FROM admin_accounts ORDER BY github_handle",
    );
    expect(rows).toEqual(
      ["andrwpham", "dducwsxuaan", "fuisl", "nhientruong04"].map((github_handle) => ({ github_handle, status: "approved" })),
    );
  });

  it("stores only a token hash on invitations", async (ctx) => {
    if (!admin) return ctx.skip();
    const columns = await query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'invitations'",
    );
    const names = columns.map((c) => c.column_name);
    expect(names).toContain("token_hash");
    expect(names).not.toContain("token");
  });
});
