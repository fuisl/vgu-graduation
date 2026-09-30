import type { LiveDisplayMessage } from "@grad/contract";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config.js";
import { runMigrations } from "../../migrate.js";

/**
 * Real-Postgres check of the display feed's reads and the updated_at triggers,
 * in its own scratch database. Skips locally when Postgres is unreachable.
 */
const baseUrl = new URL(loadConfig(process.env).databaseUrl);
const adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";
const scratchName = `grad_display_test_${process.pid}`;
const scratchUrl = new URL(baseUrl);
scratchUrl.pathname = `/${scratchName}`;

let admin: pg.Client | undefined;
let pool: pg.Pool | undefined;
let repo: InstanceType<typeof import("./display.repository.js").DisplayRepository>;
let DisplayFeedClass: typeof import("./display.feed.js").DisplayFeed;
let invitationId: string;

beforeAll(async () => {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
  } catch (err) {
    if (process.env.CI) throw err;
    console.warn("Postgres unreachable, skipping display DB tests (run `pnpm db:up`)");
    return;
  }
  admin = client;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName}`);
  await admin.query(`CREATE DATABASE ${scratchName}`);
  await runMigrations(scratchUrl.toString());

  // Same module-cache reset as invitations.db.test.ts.
  process.env.DATABASE_URL = scratchUrl.toString();
  vi.resetModules();
  const dbModule = await import("../../db/index.js");
  const { config: scratchConfig } = await import("../../config.js");
  if (scratchConfig.databaseUrl !== scratchUrl.toString()) {
    throw new Error("refusing to run: the db module is not pointed at the scratch database");
  }
  pool = dbModule.pool;
  const { DisplayRepository } = await import("./display.repository.js");
  ({ DisplayFeed: DisplayFeedClass } = await import("./display.feed.js"));
  repo = new DisplayRepository();

  const { rows } = await pool.query<{ id: string }>(
    `WITH g AS (INSERT INTO guests (name) VALUES ('Jane Guest') RETURNING id)
     INSERT INTO invitations (guest_id, token_hash) SELECT id, repeat('a', 64) FROM g RETURNING id`,
  );
  invitationId = rows[0].id;
});

afterAll(async () => {
  await pool?.end();
  if (!admin) return;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.end();
});

async function addWish(body: string): Promise<string> {
  const { rows } = await pool!.query<{ id: string }>(
    "INSERT INTO wishes (invitation_id, author_name, body) VALUES ($1, 'Jane', $2) RETURNING id",
    [invitationId, body],
  );
  return rows[0].id;
}

async function addPhoto(publicId: string): Promise<void> {
  await pool!.query(
    `INSERT INTO photos (public_id, invitation_id, original_key, content_type, size_bytes)
     VALUES ($1, $2, $1, 'image/jpeg', 1000)`,
    [publicId, invitationId],
  );
}

describe("display feed (real Postgres)", () => {
  it("the database bumps updated_at on every update, whatever the writer sets", async (ctx) => {
    if (!admin) return ctx.skip();
    const id = await addWish("trigger check");
    await pool!.query("UPDATE wishes SET moderation_status = 'hidden', updated_at = '2000-01-01' WHERE id = $1", [id]);
    const { rows } = await pool!.query("SELECT updated_at > created_at AS bumped FROM wishes WHERE id = $1", [id]);
    expect(rows[0].bumped).toBe(true);
  });

  it("maps wish and photo changes to display messages", async (ctx) => {
    if (!admin) return ctx.skip();
    const since = await repo.now();
    const wishId = await addWish("hello");
    await addPhoto("pub-pending");
    await addPhoto("pub-ready");
    await pool!.query("UPDATE photos SET processing_status = 'ready', width = 800, height = 600 WHERE public_id = 'pub-ready'");

    const changes = await repo.changesSince(new Date(since.getTime() - 1));
    const messages = Object.fromEntries(changes.map((c) => [c.key, c.message]));
    expect(messages[`wish:${wishId}`]).toMatchObject({ type: "wish", wish: { id: wishId, body: "hello" } });
    expect(messages["photo:pub-pending"]).toEqual({ type: "hidden", kind: "photo", id: "pub-pending" });
    expect(messages["photo:pub-ready"]).toMatchObject({ type: "photo", photo: { publicId: "pub-ready", width: 800, height: 600 } });
    expect(JSON.stringify(changes)).not.toContain(invitationId);
  });

  it("snapshots only visible wishes and visible, ready photos", async (ctx) => {
    if (!admin) return ctx.skip();
    const snapshot = await repo.snapshot(100);
    const kinds = snapshot.map((m) => (m.type === "wish" ? m.wish.body : m.type === "photo" ? m.photo.publicId : m.type));
    expect(kinds).toContain("hello");
    expect(kinds).toContain("pub-ready");
    expect(kinds).not.toContain("trigger check");
    expect(kinds).not.toContain("pub-pending");
  });

  it("broadcasts a moderation change on the next poll, once", async (ctx) => {
    if (!admin) return ctx.skip();
    const sent: LiveDisplayMessage[] = [];
    const feed = new DisplayFeedClass(repo, { broadcast: (m) => void sent.push(m) }, { error: vi.fn() });
    await feed.poll();
    sent.length = 0;

    await pool!.query("UPDATE photos SET moderation_status = 'hidden' WHERE public_id = 'pub-ready'");
    await feed.poll();
    await feed.poll();
    expect(sent).toEqual([{ type: "hidden", kind: "photo", id: "pub-ready" }]);

    const caught = await feed.catchUp(new Date(Date.now() - 60_000));
    expect(caught.messages).toContainEqual({ type: "hidden", kind: "photo", id: "pub-ready" });
  });
});
