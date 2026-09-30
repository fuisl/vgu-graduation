import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hashToken } from "../../auth/tokens.js";
import { loadConfig } from "../../config.js";
import { runMigrations } from "../../migrate.js";

/**
 * Real-Postgres check of the wishes module, in its own scratch database (never
 * the shared grad26 data). Skips locally when Postgres is unreachable.
 */
const baseUrl = new URL(loadConfig(process.env).databaseUrl);
const adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";
const scratchName = `grad_wishes_test_${process.pid}`;
const scratchUrl = new URL(baseUrl);
scratchUrl.pathname = `/${scratchName}`;

const TOKEN = "wishes-db-test-token";
const OTHER_TOKEN = "wishes-db-test-other-token";
const TIE_TOKEN = "wishes-db-test-tie-token";

let admin: pg.Client | undefined;
let pool: pg.Pool | undefined;
let service: InstanceType<typeof import("./wishes.service.js").WishesService>;

beforeAll(async () => {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
  } catch (err) {
    if (process.env.CI) throw err;
    console.warn("Postgres unreachable, skipping wishes DB tests (run `pnpm db:up`)");
    return;
  }
  admin = client;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName}`);
  await admin.query(`CREATE DATABASE ${scratchName}`);
  await runMigrations(scratchUrl.toString());

  // Same module-cache reset as invitations.db.test.ts: config and the pool read
  // DATABASE_URL at import time, so re-import them against the scratch database.
  process.env.DATABASE_URL = scratchUrl.toString();
  vi.resetModules();
  const dbModule = await import("../../db/index.js");
  const { config: scratchConfig } = await import("../../config.js");
  if (scratchConfig.databaseUrl !== scratchUrl.toString()) {
    throw new Error("refusing to run: the db module is not pointed at the scratch database");
  }
  pool = dbModule.pool;
  const { WishesService } = await import("./wishes.service.js");
  service = new WishesService();

  for (const [name, token] of [["Jane Guest", TOKEN], ["Other Guest", OTHER_TOKEN], ["Tie Guest", TIE_TOKEN]]) {
    await pool.query(
      `WITH g AS (INSERT INTO guests (name) VALUES ($1) RETURNING id)
       INSERT INTO invitations (guest_id, token_hash) SELECT id, $2 FROM g`,
      [name, hashToken(token)],
    );
  }
});

afterAll(async () => {
  await pool?.end();
  if (!admin) return;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.end();
});

describe("wishes (real Postgres)", () => {
  it("creates visible wishes, lists them newest first across pages", async (ctx) => {
    if (!admin) return ctx.skip();
    const first = await service.createByToken(TOKEN, { body: "first" });
    const second = await service.createByToken(TOKEN, { body: "second", authorName: "Grandma" });
    const third = await service.createByToken(OTHER_TOKEN, { body: "third" });
    expect(first).toMatchObject({ status: "ok", wish: { authorName: "Jane Guest" } });
    expect(second).toMatchObject({ status: "ok", wish: { authorName: "Grandma" } });
    expect(third.status).toBe("ok");

    const page1 = await service.listVisible({ limit: 2 });
    expect(page1.items.map((w) => w.body)).toEqual(["third", "second"]);
    const page2 = await service.listVisible({ limit: 2, cursor: page1.nextCursor! });
    expect(page2.items.map((w) => w.body)).toEqual(["first"]);
    expect(page2.nextCursor).toBeNull();
  });

  it("pages exactly through rows sharing a timestamp", async (ctx) => {
    if (!admin) return ctx.skip();
    // One transaction: now() is identical for every row, so only the id breaks ties.
    await pool!.query(
      `INSERT INTO wishes (invitation_id, author_name, body)
       SELECT id, 'Tie', 'tie ' || n FROM invitations, generate_series(1, 5) n
       WHERE token_hash = $1`,
      [hashToken(TIE_TOKEN)],
    );
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.listAll({ limit: 3, cursor });
      seen.push(...page.items.map((w) => w.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    const { rows } = await pool!.query("SELECT id FROM wishes");
    expect(new Set(seen).size).toBe(rows.length);
    expect(seen).toHaveLength(rows.length);
  });

  it("caps writes per invitation", async (ctx) => {
    if (!admin) return ctx.skip();
    // TOKEN already wrote two wishes above; the cap is five per window.
    for (let i = 0; i < 3; i++) expect((await service.createByToken(TOKEN, { body: `more ${i}` })).status).toBe("ok");
    expect((await service.createByToken(TOKEN, { body: "too many" })).status).toBe("rate_limited");
  });

  it("rejects bodies over the database limit even if the contract is bypassed", async (ctx) => {
    if (!admin) return ctx.skip();
    await expect(service.createByToken(OTHER_TOKEN, { body: "x".repeat(1001) })).rejects.toThrow();
  });

  it("hides and removes with one audit row per change and no PII", async (ctx) => {
    if (!admin) return ctx.skip();
    const { items } = await service.listVisible({ limit: 100 });
    const target = items.find((w) => w.body === "first")!;

    expect(await service.moderate(target.id, "hidden", "tester")).toEqual({ status: "ok", wish: { id: target.id, status: "hidden" } });
    expect(await service.moderate(target.id, "hidden", "tester")).toEqual({ status: "ok", wish: { id: target.id, status: "hidden" } });
    expect((await service.listVisible({ limit: 100 })).items.map((w) => w.id)).not.toContain(target.id);

    await service.moderate(target.id, "removed", "tester");
    const { rows } = await pool!.query("SELECT actor, action, target_id, metadata FROM audit WHERE action = 'wish.moderate' ORDER BY id");
    expect(rows).toEqual([
      { actor: "tester", action: "wish.moderate", target_id: target.id, metadata: { from: "visible", to: "hidden" } },
      { actor: "tester", action: "wish.moderate", target_id: target.id, metadata: { from: "hidden", to: "removed" } },
    ]);
    expect(JSON.stringify(rows)).not.toContain("Jane");

    const all = await service.listAll({ limit: 100 });
    expect(all.items.find((w) => w.id === target.id)?.status).toBe("removed");
    expect(await service.moderate("3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f", "hidden", "tester")).toEqual({ status: "not_found" });
  });
});
