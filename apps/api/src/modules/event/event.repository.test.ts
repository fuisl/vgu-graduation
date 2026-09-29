import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "../../config.js";
import { runMigrations } from "../../migrate.js";
import * as schema from "../../db/schema.js";
import { EventRepository } from "./event.repository.js";

// Own scratch database: the shared grad26 event row is never touched.
const adminUrl = new URL(config.databaseUrl);
adminUrl.pathname = "/postgres";
const scratchName = `grad_event_test_${process.pid}`;
const scratchUrl = new URL(config.databaseUrl);
scratchUrl.pathname = `/${scratchName}`;

let admin: pg.Client | undefined;
let pool: pg.Pool | undefined;

beforeAll(async () => {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
  } catch (err) {
    if (process.env.CI) throw err;
    console.warn("Postgres unreachable, skipping event repository tests (run `pnpm db:up`)");
    return;
  }
  admin = client;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName}`);
  await admin.query(`CREATE DATABASE ${scratchName}`);
  await runMigrations(scratchUrl.toString());
  pool = new pg.Pool({ connectionString: scratchUrl.toString(), max: 2 });
  pool.on("error", () => {});
});

afterAll(async () => {
  await pool?.end();
  if (!admin) return;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.end();
});

describe("EventRepository", () => {
  it("reads the seeded row, then updates it with a sequence bump and an audit row atomically", async (ctx) => {
    if (!admin || !pool) return ctx.skip();
    const repo = new EventRepository(drizzle(pool, { schema }));

    const seeded = await repo.get();
    expect(seeded?.timeConfirmed).toBe(false);
    const startSequence = seeded!.sequence;

    const updated = await repo.update(
      {
        name: "Graduation Ceremony 2026",
        startsAt: "2026-12-12T09:00:00+07:00",
        endsAt: null,
        timeZone: "Asia/Ho_Chi_Minh",
        timeConfirmed: true,
        venue: { name: "Hall", address: "Somewhere", mapUrl: "https://maps.example.com/x" },
        contact: null,
        arrivalInfo: "Arrive early",
      },
      "fuisl",
    );
    expect(updated?.sequence).toBe(startSequence + 1);
    expect(updated?.timeConfirmed).toBe(true);
    expect(updated?.startsAt.toISOString()).toBe("2026-12-12T02:00:00.000Z");
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(seeded!.updatedAt.getTime());

    const rows = (await pool.query("SELECT actor, action, target_type, target_id, metadata FROM audit")).rows;
    expect(rows).toEqual([
      {
        actor: "fuisl",
        action: "event.update",
        target_type: "event_config",
        target_id: "1",
        metadata: { sequence: startSequence + 1, timeConfirmed: true },
      },
    ]);

    const count = (await pool.query("SELECT count(*)::int AS n FROM event_config")).rows[0].n;
    expect(count).toBe(1);
  });
});
