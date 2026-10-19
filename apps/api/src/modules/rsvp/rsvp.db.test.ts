import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hashToken } from "../../auth/tokens.js";
import { loadConfig } from "../../config.js";
import { runMigrations } from "../../migrate.js";

/**
 * Real-Postgres check of RSVP accessibility needs (#176), in its own scratch
 * database (never the shared grad26 data). Skips locally when Postgres is unreachable.
 */
const baseUrl = new URL(loadConfig(process.env).databaseUrl);
const adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";
const scratchName = `grad_rsvp_test_${process.pid}`;
const scratchUrl = new URL(baseUrl);
scratchUrl.pathname = `/${scratchName}`;

const TOKEN = "rsvp-db-test-token";
const OTHER = "rsvp-db-test-other";
const DECLINED = "rsvp-db-test-declined";
const REVOKED = "rsvp-db-test-revoked";

let admin: pg.Client | undefined;
let pool: pg.Pool | undefined;
let service: InstanceType<typeof import("./rsvp.service.js").RsvpService>;

const noNeeds = {
  wheelchair: false,
  stepFreeAccess: false,
  captions: false,
  seatNearSpeakers: false,
  largePrint: false,
  visionAssistance: false,
  seatNearFront: false,
  aisleSeat: false,
  companion: false,
  note: null,
};

beforeAll(async () => {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
  } catch (err) {
    if (process.env.CI) throw err;
    console.warn("Postgres unreachable, skipping RSVP DB tests (run `pnpm db:up`)");
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
  const { RsvpService } = await import("./rsvp.service.js");
  service = new RsvpService();

  for (const [name, token] of [["Anna Access", TOKEN], ["Bao Other", OTHER], ["Cam Declined", DECLINED], ["Dan Revoked", REVOKED]]) {
    await pool.query(
      `WITH g AS (INSERT INTO guests (name) VALUES ($1) RETURNING id)
       INSERT INTO invitations (guest_id, token_hash, max_plus_ones) SELECT id, $2, 1 FROM g`,
      [name, hashToken(token!)],
    );
  }
});

afterAll(async () => {
  await pool?.end();
  if (!admin) return;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.end();
});

describe("RSVP accessibility needs (real Postgres)", () => {
  it("stores, keeps, replaces and clears a guest's needs", async (ctx) => {
    if (!admin) return ctx.skip();
    expect(await service.getByToken(TOKEN)).toEqual({ status: "ok", rsvp: null });

    const saved = await service.putByToken(TOKEN, {
      attending: true,
      plusOnesCount: 1,
      accessibility: { ...noNeeds, wheelchair: true, companion: true, note: "Arrives by taxi" },
    });
    expect(saved).toMatchObject({ status: "ok", rsvp: { accessibility: { wheelchair: true, companion: true, note: "Arrives by taxi" } } });

    // A form that doesn't send accessibility keeps it.
    await service.putByToken(TOKEN, { attending: true, plusOnesCount: 0 });
    const read = await service.getByToken(TOKEN);
    expect(read).toMatchObject({ status: "ok", rsvp: { plusOnesCount: 0, accessibility: { wheelchair: true } } });

    await service.putByToken(TOKEN, { attending: true, plusOnesCount: 0, accessibility: { ...noNeeds, largePrint: true, note: "" } });
    expect(await service.getByToken(TOKEN)).toMatchObject({
      rsvp: { accessibility: { ...noNeeds, largePrint: true, note: null } },
    });

    await service.putByToken(TOKEN, { attending: true, plusOnesCount: 0, accessibility: noNeeds });
    expect(await service.getByToken(TOKEN)).toMatchObject({ rsvp: { accessibility: null } });
    const { rows } = await pool!.query("SELECT count(*)::int AS n FROM rsvp_accessibility");
    expect(rows[0].n).toBe(0);

    expect(await service.getByToken("unknown")).toEqual({ status: "invalid" });
  });

  it("lists needs for admins, counting attending guests on active invitations only", async (ctx) => {
    if (!admin) return ctx.skip();
    await service.putByToken(TOKEN, { attending: true, plusOnesCount: 0, accessibility: { ...noNeeds, wheelchair: true, aisleSeat: true } });
    await service.putByToken(OTHER, { attending: true, plusOnesCount: 1, accessibility: { ...noNeeds, wheelchair: true, note: "Hearing aid" } });
    await service.putByToken(DECLINED, { attending: false, plusOnesCount: 0, accessibility: { ...noNeeds, largePrint: true } });
    await service.putByToken(REVOKED, { attending: true, plusOnesCount: 0, accessibility: { ...noNeeds, captions: true } });
    await pool!.query("UPDATE invitations SET status = 'revoked' WHERE token_hash = $1", [hashToken(REVOKED)]);

    const result = await service.listAccessibility();
    expect(result.items.map((i) => i.guestName)).toEqual(["Anna Access", "Bao Other", "Cam Declined"]);
    expect(result.summary).toEqual({
      guests: 2,
      withNote: 1,
      needs: { ...Object.fromEntries(Object.keys(noNeeds).filter((k) => k !== "note").map((k) => [k, 0])), wheelchair: 2, aisleSeat: 1 },
    });
  });

  it("keeps needs out of the cached invitation and the general admin RSVP list", async (ctx) => {
    if (!admin) return ctx.skip();
    const { InvitationsService } = await import("../invitations/invitations.service.js");
    const me = await new InvitationsService().resolveByToken(TOKEN);
    expect(JSON.stringify(me)).not.toContain("wheelchair");
    expect(JSON.stringify(await service.listAll())).not.toContain("wheelchair");
  });

  it("removes needs with the RSVP and enforces the note length in the database", async (ctx) => {
    if (!admin) return ctx.skip();
    await expect(
      pool!.query("UPDATE rsvp_accessibility SET note = repeat('x', 501)"),
    ).rejects.toThrow(/rsvp_accessibility_note_length_check/);
    await pool!.query("DELETE FROM rsvp");
    const { rows } = await pool!.query("SELECT count(*)::int AS n FROM rsvp_accessibility");
    expect(rows[0].n).toBe(0);
  });
});
