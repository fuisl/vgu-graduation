import crypto from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config.js";
import { runMigrations } from "../../migrate.js";

/**
 * Real-Postgres check of the media repository, in its own scratch database
 * (never the shared grad26 data). Skips locally when Postgres is unreachable.
 */
const baseUrl = new URL(loadConfig(process.env).databaseUrl);
const adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";
const scratchName = `grad_media_test_${process.pid}`;
const scratchUrl = new URL(baseUrl);
scratchUrl.pathname = `/${scratchName}`;

let admin: pg.Client | undefined;
let pool: pg.Pool | undefined;
let repo: InstanceType<typeof import("./media.repository.js").MediaRepository>;
let DERIVE_JOB: string;
let invitationId: string;

beforeAll(async () => {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
  } catch (err) {
    if (process.env.CI) throw err;
    console.warn("Postgres unreachable, skipping media DB tests (run `pnpm db:up`)");
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
  // Idle connections dropped by DROP DATABASE ... FORCE would otherwise hit the db
  // module's exit-on-error handler and crash the run (see queue.db.test.ts).
  pool.removeAllListeners("error");
  pool.on("error", () => {});
  const mod = await import("./media.repository.js");
  repo = new mod.MediaRepository();
  DERIVE_JOB = mod.DERIVE_JOB;
});

afterAll(async () => {
  await pool?.end();
  if (!admin) return;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.end();
});

beforeEach(async (ctx) => {
  if (!admin) return ctx.skip();
  await pool!.query("TRUNCATE photos, jobs, invitations, guests CASCADE");
  const { rows: [guest] } = await pool!.query("INSERT INTO guests (name) VALUES ('Test Guest') RETURNING id");
  const { rows: [inv] } = await pool!.query(
    "INSERT INTO invitations (guest_id, token_hash) VALUES ($1, $2) RETURNING id",
    [guest.id, crypto.randomBytes(32).toString("hex")],
  );
  invitationId = inv.id;
});

const newPhoto = () => {
  const id = crypto.randomUUID();
  return {
    id,
    publicId: crypto.randomBytes(16).toString("base64url"),
    invitationId,
    originalKey: id,
    contentType: "image/jpeg",
    sizeBytes: 1234,
  };
};

describe("MediaRepository (real Postgres)", () => {
  it("inserts a pending, visible photo and its derive job carrying the id only", async () => {
    const photo = newPhoto();
    expect(await repo.createWithJob(photo, 36)).toEqual({ status: "ok", publicId: photo.publicId, shotsUsed: 1 });

    const { rows: photos } = await pool!.query("SELECT processing_status, moderation_status FROM photos");
    expect(photos).toEqual([{ processing_status: "pending", moderation_status: "visible" }]);
    const { rows: jobs } = await pool!.query("SELECT type, payload, status FROM jobs");
    expect(jobs).toEqual([{ type: DERIVE_JOB, payload: { photoId: photo.id }, status: "queued" }]);
    expect(await repo.countShots(invitationId)).toBe(1);
  });

  it("never lets concurrent uploads overshoot the roll", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => repo.createWithJob(newPhoto(), 5)));
    expect(results.filter((r) => r.status === "ok")).toHaveLength(5);
    expect(results.filter((r) => r.status === "roll_finished")).toHaveLength(3);
    expect(await repo.countShots(invitationId)).toBe(5);
    const { rows } = await pool!.query("SELECT count(*)::int AS n FROM jobs");
    expect(rows[0].n).toBe(5);
  });

  it("counts hidden and removed photos against the roll", async () => {
    await repo.createWithJob(newPhoto(), 2);
    await repo.createWithJob(newPhoto(), 2);
    await pool!.query("UPDATE photos SET moderation_status = 'removed'");
    expect(await repo.createWithJob(newPhoto(), 2)).toEqual({ status: "roll_finished" });
  });
});
