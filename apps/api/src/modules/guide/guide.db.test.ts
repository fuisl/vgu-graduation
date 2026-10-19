import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hashToken } from "../../auth/tokens.js";
import { loadConfig } from "../../config.js";
import { runMigrations } from "../../migrate.js";

/**
 * Real-Postgres check of the guide-book (#140), in its own scratch database
 * (never the shared grad26 data). Skips locally when Postgres is unreachable.
 */
const baseUrl = new URL(loadConfig(process.env).databaseUrl);
const adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";
const scratchName = `grad_guide_test_${process.pid}`;
const scratchUrl = new URL(baseUrl);
scratchUrl.pathname = `/${scratchName}`;

const TOKEN = "guide-db-test-token";

let admin: pg.Client | undefined;
let pool: pg.Pool | undefined;
let service: InstanceType<typeof import("./guide.service.js").GuideService>;
let invitationId: string;

beforeAll(async () => {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
  } catch (err) {
    if (process.env.CI) throw err;
    console.warn("Postgres unreachable, skipping guide DB tests (run `pnpm db:up`)");
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
  const { GuideService } = await import("./guide.service.js");
  service = new GuideService();

  const { rows } = await pool.query(
    `WITH g AS (INSERT INTO guests (name) VALUES ('Guide Guest') RETURNING id)
     INSERT INTO invitations (guest_id, token_hash) SELECT id, $1 FROM g RETURNING id`,
    [hashToken(TOKEN)],
  );
  invitationId = rows[0].id;
});

afterAll(async () => {
  await pool?.end();
  if (!admin) return;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.end();
});

describe("guide-book (real Postgres)", () => {
  it("gives a new invitation the seeded defaults, in order", async (ctx) => {
    if (!admin) return ctx.skip();
    const result = await service.guideByToken(TOKEN);
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.guide.tailored).toBe(false);
    expect(result.guide.items.length).toBeGreaterThanOrEqual(8);
    const orders = result.guide.items.map((i) => i.sortOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(await service.guideByToken("unknown")).toEqual({ status: "invalid" });
  });

  it("tailors to picks, ignores inactive ones, and falls back when none are active", async (ctx) => {
    if (!admin) return ctx.skip();
    const created = await service.createItem(
      { title: "Graduates' favourite bench", category: "relax", description: "", mapUrl: null, timeHint: null, sortOrder: 5, active: true },
      "tester",
    );
    const { items } = await service.listItems();
    const library = items.find((i) => i.title === "University library")!;

    const set = await service.setInvitationGuide(invitationId, [library.id, created.id, created.id], "tester");
    expect(set).toMatchObject({ status: "ok", guide: { effective: { tailored: true } } });
    if (set.status !== "ok") throw new Error("expected ok");
    expect(set.guide.effective.items.map((i) => i.title)).toEqual(["Graduates' favourite bench", "University library"]);
    expect(set.guide.selectedItemIds).toHaveLength(2);

    await service.updateItem(created.id, { active: false }, "tester");
    await service.updateItem(library.id, { active: false }, "tester");
    const fallback = await service.guideByToken(TOKEN);
    expect(fallback).toMatchObject({ status: "ok", guide: { tailored: false } });
    // The picks are kept for when the items come back.
    expect((await service.invitationGuide(invitationId))?.selectedItemIds).toHaveLength(2);

    await service.updateItem(library.id, { active: true }, "tester");
    expect((await service.guideByToken(TOKEN))).toMatchObject({ guide: { tailored: true, items: [{ title: "University library" }] } });

    expect(await service.setInvitationGuide(invitationId, ["3f2e8b1a-9c3d-4c9a-8b1e-999999999999"], "tester")).toEqual({ status: "unknown_items" });
    expect(await service.setInvitationGuide("3f2e8b1a-9c3d-4c9a-8b1e-999999999999", [], "tester")).toEqual({ status: "not_found" });
  });

  it("deletes an item with its picks, and audits every write with ids only", async (ctx) => {
    if (!admin) return ctx.skip();
    const created = await service.createItem(
      { title: "Temporary", category: "practical", description: "", mapUrl: null, timeHint: null, sortOrder: 0, active: true },
      "tester",
    );
    await service.setInvitationGuide(invitationId, [created.id], "tester");
    expect(await service.deleteItem(created.id, "tester")).toBe(true);
    expect(await service.deleteItem(created.id, "tester")).toBe(false);
    expect((await service.invitationGuide(invitationId))?.selectedItemIds).toEqual([]);

    const { rows } = await pool!.query("SELECT action, metadata FROM audit ORDER BY id");
    expect(rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(["guide.item.create", "guide.item.update", "guide.item.delete", "invitation.guide.set"]),
    );
    expect(rows.find((r) => r.action === "invitation.guide.set")?.metadata).toEqual({ count: 2 });
    expect(JSON.stringify(rows)).not.toContain("Guide Guest");
  });

  it("enforces https map links in the database too", async (ctx) => {
    if (!admin) return ctx.skip();
    await expect(
      pool!.query("INSERT INTO guide_items (title, category, map_url) VALUES ('x', 'explore', 'http://insecure.example')"),
    ).rejects.toThrow(/guide_items_map_url_check/);
  });
});
