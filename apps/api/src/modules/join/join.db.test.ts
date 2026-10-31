import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config.js";
import { runMigrations } from "../../migrate.js";

/**
 * Real-Postgres check of guest self-registration (ADR-015), in its own scratch
 * database (never the shared grad26 data). Skips locally when Postgres is unreachable.
 */
const baseUrl = new URL(loadConfig(process.env).databaseUrl);
const adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";
const scratchName = `grad_join_test_${process.pid}`;
const scratchUrl = new URL(baseUrl);
scratchUrl.pathname = `/${scratchName}`;

let admin: pg.Client | undefined;
let pool: pg.Pool | undefined;
let repository: InstanceType<typeof import("./join.repository.js").JoinRepository>;
let graduates: InstanceType<typeof import("../graduates/graduates.service.js").GraduatesService>;

beforeAll(async () => {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
  } catch (err) {
    if (process.env.CI) throw err;
    console.warn("Postgres unreachable, skipping join DB tests (run `pnpm db:up`)");
    return;
  }
  admin = client;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName}`);
  await admin.query(`CREATE DATABASE ${scratchName}`);
  await runMigrations(scratchUrl.toString());

  // config.ts and the db module read DATABASE_URL at import time: point it at the scratch
  // database and reset the module cache, as invitations.db.test.ts explains.
  process.env.DATABASE_URL = scratchUrl.toString();
  vi.resetModules();
  const dbModule = await import("../../db/index.js");
  const { config: scratchConfig } = await import("../../config.js");
  if (scratchConfig.databaseUrl !== scratchUrl.toString()) {
    throw new Error("refusing to run: the db module is not pointed at the scratch database");
  }
  pool = dbModule.pool;
  const { JoinRepository } = await import("./join.repository.js");
  const { GraduatesService } = await import("../graduates/graduates.service.js");
  repository = new JoinRepository();
  graduates = new GraduatesService();
});

afterAll(async () => {
  await pool?.end();
  if (!admin) return;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.end();
});

const hash = (n: number) => n.toString(16).padStart(64, "0");

async function invitersOf(invitationId: string): Promise<string[]> {
  const { rows } = await pool!.query<{ user_id: string }>(
    "SELECT user_id FROM invitation_inviters WHERE invitation_id = $1 ORDER BY user_id",
    [invitationId],
  );
  return rows.map((r) => r.user_id);
}

describe("guest self-registration (real Postgres)", () => {
  it("issues one join code per graduate, keeps it on repeat requests, and rotates it", async (ctx) => {
    if (!admin) return ctx.skip();
    const ann = await graduates.createGraduate({ name: "Ann Nguyen", email: "ann@example.com" }, "tester");
    expect(ann.joinUrl).toBeNull();

    expect(await repository.ensureJoinCode(ann.id, "first-code-1")).toBe("first-code-1");
    expect(await repository.ensureJoinCode(ann.id, "second-code-2")).toBe("first-code-1");
    expect(await repository.findGraduateByCode("first-code-1")).toMatchObject({ id: ann.id, givenName: "Ann" });
    expect((await graduates.listGraduates()).items[0].joinUrl).toMatch(/\/join\/first-code-1$/);

    expect(await repository.rotateJoinCode(ann.id, "rotated-code-3", "tester")).toBe(true);
    expect(await repository.findGraduateByCode("first-code-1")).toBeNull();
    expect(await repository.findGraduateByEmail("ann@example.com")).toMatchObject({ joinCode: "rotated-code-3" });
    expect(await repository.rotateJoinCode("00000000-0000-4000-8000-000000000000", "x-code-0000", "tester")).toBe(false);

    const { rows } = await pool!.query("SELECT action, metadata FROM audit WHERE target_id = $1 ORDER BY id", [ann.id]);
    expect(rows.map((r) => r.action)).toEqual(["graduate.create", "graduate.join_link_issue", "graduate.join_link_rotate"]);
  });

  it("creates an invitation for a new address and adds a second graduate as co-inviter instead of a duplicate", async (ctx) => {
    if (!admin) return ctx.skip();
    const bao = await graduates.createGraduate({ name: "Bao Le", email: "bao@example.com" }, "tester");
    const chi = await graduates.createGraduate({ name: "Chi Pham", email: "chi@example.com" }, "tester");

    const created = await repository.register({ graduateId: bao.id, name: "Dung Tran", email: "dung@example.com", tokenHash: hash(1) });
    expect(created).toMatchObject({ kind: "created", givenName: "Dung" });
    if (created.kind !== "created") throw new Error("expected a new invitation");

    // The same address again, through another graduate's link, and with different capitalisation stored.
    await pool!.query("UPDATE guests SET email = 'Dung@Example.com' WHERE id = $1", [created.guestId]);
    const again = await repository.register({ graduateId: chi.id, name: "Dung T.", email: "dung@example.com", tokenHash: hash(2) });
    expect(again).toEqual({ kind: "existing", invitationId: created.invitationId });
    expect(await invitersOf(created.invitationId)).toEqual([bao.id, chi.id].sort());
    // Repeating it is a no-op.
    expect(await repository.register({ graduateId: chi.id, name: "Dung", email: "dung@example.com", tokenHash: hash(3) })).toEqual(again);

    const { rows: invitations } = await pool!.query("SELECT max_plus_ones, status FROM invitations WHERE id = $1", [created.invitationId]);
    expect(invitations).toEqual([{ max_plus_ones: 0, status: "active" }]);
    const { rows: guestCount } = await pool!.query("SELECT count(*)::int AS n FROM guests");
    expect(guestCount[0].n).toBe(1);

    const { rows: audit } = await pool!.query("SELECT actor, action, metadata FROM audit WHERE target_id = $1 ORDER BY id", [created.invitationId]);
    expect(audit.map((r) => r.action)).toEqual(["invitation.join_create", "invitation.join_add_inviter"]);
    expect(audit.every((r) => r.actor === "join-link")).toBe(true);
    expect(JSON.stringify(audit)).not.toContain("dung@");
  });

  it("serialises simultaneous registrations of one address into one invitation", async (ctx) => {
    if (!admin) return ctx.skip();
    const eve = await graduates.createGraduate({ name: "Eve Vo", email: "eve@example.com" }, "tester");
    const results = await Promise.all(
      [10, 11, 12].map((n) => repository.register({ graduateId: eve.id, name: "Giang", email: "giang@example.com", tokenHash: hash(n) })),
    );
    expect(results.filter((r) => r.kind === "created")).toHaveLength(1);
    const { rows } = await pool!.query("SELECT count(*)::int AS n FROM guests WHERE email = 'giang@example.com'");
    expect(rows[0].n).toBe(1);
  });

  it("discards a registration whose email failed, so the same address can register again", async (ctx) => {
    if (!admin) return ctx.skip();
    const hoa = await graduates.createGraduate({ name: "Hoa Do", email: "hoa@example.com" }, "tester");
    const first = await repository.register({ graduateId: hoa.id, name: "Khanh", email: "khanh@example.com", tokenHash: hash(20) });
    if (first.kind !== "created") throw new Error("expected a new invitation");
    await repository.discard({ invitationId: first.invitationId, guestId: first.guestId, graduateId: hoa.id });

    const { rows } = await pool!.query("SELECT count(*)::int AS n FROM invitations WHERE id = $1", [first.invitationId]);
    expect(rows[0].n).toBe(0);
    expect((await repository.register({ graduateId: hoa.id, name: "Khanh", email: "khanh@example.com", tokenHash: hash(21) })).kind).toBe("created");
  });

  it("ignores a revoked invitation and only matches graduates", async (ctx) => {
    if (!admin) return ctx.skip();
    const lan = await graduates.createGraduate({ name: "Lan Ho", email: "lan@example.com" }, "tester");
    const first = await repository.register({ graduateId: lan.id, name: "Minh", email: "minh@example.com", tokenHash: hash(30) });
    await pool!.query("UPDATE invitations SET status = 'revoked', revoked_at = now() WHERE id = $1", [first.invitationId]);
    expect((await repository.register({ graduateId: lan.id, name: "Minh", email: "minh@example.com", tokenHash: hash(31) })).kind).toBe("created");

    await pool!.query("INSERT INTO users (name, given_name, email, role, join_code) VALUES ('Admin', 'Admin', 'admin@example.com', 'admin', 'admin-code-1')");
    expect(await repository.findGraduateByCode("admin-code-1")).toBeNull();
    expect(await repository.findGraduateByEmail("admin@example.com")).toBeNull();
  });
});
