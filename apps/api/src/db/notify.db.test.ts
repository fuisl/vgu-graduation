import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { runMigrations } from "../migrate.js";
import { JOBS_CHANNEL, LIVE_CHANNEL, PgListener } from "./notify.js";

/**
 * Real-Postgres check of the NOTIFY triggers (ADR-014, migration 0008): a wish
 * or photo write wakes `grad_live` on commit, a queued job wakes `grad_jobs`,
 * and a rolled-back write wakes nothing. Skips locally when Postgres is unreachable.
 */
const baseUrl = new URL(loadConfig(process.env).databaseUrl);
const adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";
const scratchName = `grad_notify_test_${process.pid}`;
const scratchUrl = new URL(baseUrl);
scratchUrl.pathname = `/${scratchName}`;

let admin: pg.Client | undefined;
let pool: pg.Pool | undefined;
let invitationId: string;

beforeAll(async () => {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
  } catch (err) {
    if (process.env.CI) throw err;
    console.warn("Postgres unreachable, skipping NOTIFY DB tests (run `pnpm db:up`)");
    return;
  }
  admin = client;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName}`);
  await admin.query(`CREATE DATABASE ${scratchName}`);
  await runMigrations(scratchUrl.toString());
  pool = new pg.Pool({ connectionString: scratchUrl.toString(), max: 2 });
  const { rows } = await pool.query<{ id: string }>(
    `WITH g AS (INSERT INTO guests (name) VALUES ('Jane Guest') RETURNING id)
     INSERT INTO invitations (guest_id, token_hash) SELECT id, repeat('b', 64) FROM g RETURNING id`,
  );
  invitationId = rows[0]!.id;
});

afterAll(async () => {
  await pool?.end();
  if (!admin) return;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.end();
});

async function listening(channel: string) {
  const onNotify = vi.fn();
  const listener = new PgListener({ connectionString: scratchUrl.toString(), channel, log: { warn: () => {} } });
  listener.start({ onNotify });
  // LISTEN is in place once a self-test notification comes back.
  await vi.waitFor(
    async () => {
      await pool!.query(`SELECT pg_notify($1, 'probe')`, [channel]);
      expect(onNotify).toHaveBeenCalled();
    },
    { timeout: 5_000, interval: 50 },
  );
  // Let any probe still in flight land before counting.
  await new Promise((r) => setTimeout(r, 200));
  onNotify.mockClear();
  return { listener, onNotify };
}

describe("NOTIFY triggers", () => {
  it("wakes grad_live when a wish is written or moderated, only on commit", async () => {
    if (!admin) return;
    const { listener, onNotify } = await listening(LIVE_CHANNEL);
    try {
      const client = await pool!.connect();
      await client.query("BEGIN");
      await client.query("INSERT INTO wishes (invitation_id, author_name, body) VALUES ($1, 'Jane', 'rolled back')", [invitationId]);
      await client.query("ROLLBACK");
      client.release();
      await new Promise((r) => setTimeout(r, 200));
      expect(onNotify).not.toHaveBeenCalled();

      const { rows } = await pool!.query<{ id: string }>(
        "INSERT INTO wishes (invitation_id, author_name, body) VALUES ($1, 'Jane', 'Congrats!') RETURNING id",
        [invitationId],
      );
      await vi.waitFor(() => expect(onNotify).toHaveBeenCalledTimes(1));
      await pool!.query("UPDATE wishes SET moderation_status = 'hidden' WHERE id = $1", [rows[0]!.id]);
      await vi.waitFor(() => expect(onNotify).toHaveBeenCalledTimes(2));
    } finally {
      await listener.stop();
    }
  });

  it("wakes grad_live when a photo becomes ready", async () => {
    if (!admin) return;
    const { rows } = await pool!.query<{ id: string }>(
      `INSERT INTO photos (public_id, invitation_id, original_key, content_type, size_bytes)
       VALUES ('pub-notify-1', $1, 'k', 'image/jpeg', 10) RETURNING id`,
      [invitationId],
    );
    const { listener, onNotify } = await listening(LIVE_CHANNEL);
    try {
      await pool!.query("UPDATE photos SET processing_status = 'ready' WHERE id = $1", [rows[0]!.id]);
      await vi.waitFor(() => expect(onNotify).toHaveBeenCalledTimes(1));
    } finally {
      await listener.stop();
    }
  });

  it("wakes grad_jobs when a job is queued", async () => {
    if (!admin) return;
    const { listener, onNotify } = await listening(JOBS_CHANNEL);
    try {
      await pool!.query("INSERT INTO jobs (type, payload) VALUES ('demo', '{}')");
      await vi.waitFor(() => expect(onNotify).toHaveBeenCalledTimes(1));
    } finally {
      await listener.stop();
    }
  });
});
