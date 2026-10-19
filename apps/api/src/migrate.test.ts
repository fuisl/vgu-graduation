import { splitPersonName } from "@grad/contract";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "./config.js";
import { runMigrations } from "./migrate.js";

const EXPECTED_TABLES = [
  "admin_accounts",
  "audit",
  "event_config",
  "guests",
  "guide_items",
  "invitation_guide_items",
  "invitation_inviters",
  "invitations",
  "jobs",
  "mail_cursors",
  "photos",
  "print_jobs",
  "rsvp",
  "rsvp_accessibility",
  "translation_segments",
  "translation_texts",
  "users",
  "wishes",
];

const MIGRATIONS_FOLDER = path.resolve(__dirname, "../drizzle");

/** A copy of the migrations folder holding only the first `count` migrations. */
function migrationsUpTo(count: number): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grad-migrations-"));
  fs.mkdirSync(path.join(dir, "meta"));
  const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8"));
  journal.entries = journal.entries.slice(0, count);
  fs.writeFileSync(path.join(dir, "meta/_journal.json"), JSON.stringify(journal));
  for (const entry of journal.entries as { tag: string }[]) {
    fs.copyFileSync(path.join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), path.join(dir, `${entry.tag}.sql`));
  }
  return dir;
}

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
    // Every migration in the journal, so a new one doesn't need this test edited.
    const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8")) as { entries: unknown[] };
    expect(Number(applied[0].count)).toBe(journal.entries.length);

    // 0004 moves the untouched placeholder date to 20 November 2026 and bumps the calendar sequence once.
    const [event] = await query<{ epoch: string; sequence: number }>(
      "SELECT extract(epoch FROM starts_at)::bigint AS epoch, sequence FROM event_config WHERE id = 1",
    );
    expect(Number(event.epoch) * 1000).toBe(Date.parse("2026-11-20T09:00:00+07:00"));
    expect(event.sequence).toBe(1);

    // 0006 (#9) translates the untouched placeholder name and address, and nothing else.
    const [vi] = await query<{ name_vi: string | null; venue_address_vi: string | null; arrival_info_vi: string | null }>(
      "SELECT name_vi, venue_address_vi, arrival_info_vi FROM event_config WHERE id = 1",
    );
    expect(vi).toEqual({
      name_vi: "Lễ tốt nghiệp GRAD '26",
      venue_address_vi: "Trường Đại học Việt Đức (địa chỉ đầy đủ sẽ được xác nhận)",
      arrival_info_vi: null,
    });
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

  it("seeds the default guide-book items, all active and flagged for owner review in the SQL", async (ctx) => {
    if (!admin) return ctx.skip();
    const rows = await query<{ title: string; active: boolean; map_url: string | null }>(
      "SELECT title, active, map_url FROM guide_items ORDER BY sort_order",
    );
    expect(rows.length).toBeGreaterThanOrEqual(8);
    expect(rows.every((r) => r.active && r.map_url === null)).toBe(true);
    const sql = fs.readFileSync(path.join(MIGRATIONS_FOLDER, "0005_finish_grad26.sql"), "utf8");
    expect(sql.match(/TODO\(owner\)/g)?.length).toBe(rows.length);
  });

  it("backfills given and family names of existing guests and graduates like splitPersonName", async (ctx) => {
    if (!admin) return ctx.skip();
    const name = `${scratchName}_backfill`;
    await admin.query(`CREATE DATABASE ${name}`);
    const url = new URL(config.databaseUrl);
    url.pathname = `/${name}`;
    const before0005 = migrationsUpTo(5);
    const names = [
      "Nguyễn Văn An",
      "NGUYEN VAN AN",
      "Trần Thị Bích Ngọc",
      "Đặng Hữu Phúc",
      "John Smith",
      "Mary Jane Watson",
      "Ann Nguyen",
      "Mai Tran",
      "Lê Mai",
      "Madonna",
      "  Hồ   Chí  Minh ",
    ];
    const client = new pg.Client({ connectionString: url.toString() });
    try {
      await runMigrations(url.toString(), before0005);
      await client.connect();
      for (const [i, n] of names.entries()) {
        await client.query("INSERT INTO guests (name) VALUES ($1)", [n]);
        await client.query("INSERT INTO users (name, email) VALUES ($1, $2)", [n, `g${i}@example.com`]);
      }
      await runMigrations(url.toString());

      for (const table of ["guests", "users"]) {
        const { rows } = await client.query<{ name: string; given_name: string; family_name: string | null; name_reviewed: boolean }>(
          `SELECT name, given_name, family_name, name_reviewed FROM ${table}`,
        );
        expect(rows).toHaveLength(names.length);
        for (const row of rows) {
          const expected = splitPersonName(row.name);
          expect({ name: row.name, given: row.given_name, family: row.family_name }).toEqual({
            name: row.name,
            given: expected.givenName,
            family: expected.familyName,
          });
          expect(row.name_reviewed).toBe(false);
        }
      }
      const { rows: an } = await client.query("SELECT given_name, family_name FROM guests WHERE name = 'Nguyễn Văn An'");
      expect(an).toEqual([{ given_name: "An", family_name: "Nguyễn" }]);
      const { rows: john } = await client.query("SELECT given_name, family_name FROM guests WHERE name = 'John Smith'");
      expect(john).toEqual([{ given_name: "John", family_name: "Smith" }]);
    } finally {
      await client.end().catch(() => {});
      fs.rmSync(before0005, { recursive: true, force: true });
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    }
  });

  it("requires a given name and defaults public flags to off", async (ctx) => {
    if (!admin) return ctx.skip();
    const columns = await query<{ table_name: string; column_name: string; is_nullable: string; column_default: string | null }>(
      `SELECT table_name, column_name, is_nullable, column_default FROM information_schema.columns
       WHERE (table_name IN ('guests', 'users') AND column_name = 'given_name')
          OR (table_name IN ('photos', 'wishes') AND column_name = 'is_public')
       ORDER BY table_name`,
    );
    expect(columns.map((c) => [c.table_name, c.is_nullable, c.column_default])).toEqual([
      ["guests", "NO", null],
      ["photos", "NO", "false"],
      ["users", "NO", null],
      ["wishes", "NO", "false"],
    ]);
  });

  it("splits the name of a row inserted without a given name, and keeps an explicit one", async (ctx) => {
    if (!admin) return ctx.skip();
    await query("INSERT INTO guests (name) VALUES ('Phạm Minh Châu')");
    await query("INSERT INTO guests (name, given_name, family_name, name_reviewed) VALUES ('Dr. Jane Doe', 'Jane', 'Doe', true)");
    const rows = await query<{ given_name: string; family_name: string | null; name_reviewed: boolean }>(
      "SELECT given_name, family_name, name_reviewed FROM guests ORDER BY created_at, given_name",
    );
    expect(rows).toEqual([
      { given_name: "Châu", family_name: "Phạm", name_reviewed: false },
      { given_name: "Jane", family_name: "Doe", name_reviewed: true },
    ]);
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
