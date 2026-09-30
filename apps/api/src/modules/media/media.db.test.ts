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
let derivatives: typeof import("./derivatives.js");
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
  derivatives = await import("./derivatives.js");
});

afterAll(async () => {
  await pool?.end();
  if (!admin) return;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.end();
});

beforeEach(async (ctx) => {
  if (!admin) return ctx.skip();
  await pool!.query("TRUNCATE photos, jobs, audit, invitations, guests CASCADE");
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

  it("runs the queued derive job end to end: pending, then ready with dimensions", async () => {
    const { JobQueue } = await import("../../worker/queue.js");
    const { fakeObjectStore } = await import("../../storage/object-store.fake.js");
    const sharp = (await import("sharp")).default;
    const storage = fakeObjectStore();
    const photo = newPhoto();
    await storage.store.put("grad-originals", photo.originalKey,
      await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#123456" } }).jpeg().toBuffer(), "image/jpeg");
    await repo.createWithJob(photo, 36);

    const queue = new JobQueue(pool!);
    const job = await queue.claim("test-worker");
    expect(job).toMatchObject({ type: DERIVE_JOB, payload: { photoId: photo.id } });
    const handler = derivatives.deriveHandler({
      store: storage.store,
      config: loadConfig({ S3_BUCKET_ORIGINALS: "grad-originals", S3_BUCKET_DERIVATIVES: "grad-derivatives" }),
    });
    await handler(job!);
    await queue.complete(job!, "test-worker");

    const { rows } = await pool!.query("SELECT processing_status, moderation_status, width, height FROM photos");
    expect(rows).toEqual([{ processing_status: "ready", moderation_status: "visible", width: 1200, height: 800 }]);
    expect(storage.objects.has(`grad-derivatives/${photo.publicId}-display.jpg`)).toBe(true);
  });

  it("marks a photo failed", async () => {
    const photo = newPhoto();
    await repo.createWithJob(photo, 36);
    await repo.markFailed(photo.id);
    expect(await repo.findForDerivation(photo.id)).toMatchObject({ processingStatus: "failed", moderationStatus: "visible" });
    expect(await repo.findForDerivation(crypto.randomUUID())).toBeNull();
  });

  it("pages the gallery by keyset without losing or repeating rows, even with equal timestamps", async () => {
    const created: string[] = [];
    for (let i = 0; i < 7; i++) {
      const photo = newPhoto();
      await repo.createWithJob(photo, 36);
      created.push(photo.publicId);
    }
    await pool!.query("UPDATE photos SET processing_status = 'ready'");
    // Three rows share one microsecond-precision timestamp; JS Dates would round it.
    await pool!.query(
      "UPDATE photos SET created_at = '2026-11-15 10:00:00.123456+07' WHERE public_id = ANY($1)",
      [created.slice(0, 3)],
    );
    // Not listable: hidden, removed, still pending.
    await pool!.query("UPDATE photos SET moderation_status = 'hidden' WHERE public_id = $1", [created[3]]);
    await pool!.query("UPDATE photos SET moderation_status = 'removed' WHERE public_id = $1", [created[4]]);
    await pool!.query("UPDATE photos SET processing_status = 'pending' WHERE public_id = $1", [created[5]]);

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const rows = await repo.listGallery(2, cursor);
      seen.push(...rows.slice(0, 2).map((r) => r.publicId));
      if (rows.length <= 2) break;
      cursor = rows[1]!.publicId;
    }
    expect(seen.sort()).toEqual([created[0], created[1], created[2], created[6]].sort());
    expect(new Set(seen).size).toBe(seen.length);
    expect(await repo.isServable(created[6]!)).toBe(true);
    expect(await repo.isServable(created[3]!)).toBe(false);
    expect(await repo.isServable(created[5]!)).toBe(false);
  });

  it("moderates and audits in one step, without PII", async () => {
    const photo = newPhoto();
    await repo.createWithJob(photo, 36);
    expect(await repo.moderate(photo.publicId, "hidden", "tester")).toBe("hidden");
    expect(await repo.moderate("missing", "hidden", "tester")).toBeNull();
    const { rows } = await pool!.query("SELECT actor, action, target_type, target_id, metadata FROM audit");
    expect(rows).toEqual([
      {
        actor: "tester",
        action: "photo.moderate",
        target_type: "photo",
        target_id: photo.id,
        metadata: { from: "visible", to: "hidden" },
      },
    ]);
    expect(await repo.findForDerivation(photo.id)).toMatchObject({ moderationStatus: "hidden" });
  });
});
