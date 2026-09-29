import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import { runMigrations } from "../../migrate.js";

/**
 * Real-Postgres check of the admin write paths, in its own scratch database
 * (never the shared grad26 data). Skips locally when Postgres is unreachable.
 */
const baseUrl = new URL(loadConfig({}).databaseUrl);
const adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";
const scratchName = `grad_invitations_test_${process.pid}`;
const scratchUrl = new URL(baseUrl);
scratchUrl.pathname = `/${scratchName}`;

let admin: pg.Client | undefined;
let pool: pg.Pool | undefined;
let invitations: InstanceType<typeof import("./invitations.service.js").InvitationsService>;
let graduates: InstanceType<typeof import("../graduates/graduates.service.js").GraduatesService>;

beforeAll(async () => {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
  } catch (err) {
    if (process.env.CI) throw err;
    console.warn("Postgres unreachable, skipping invitations DB tests (run `pnpm db:up`)");
    return;
  }
  admin = client;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName}`);
  await admin.query(`CREATE DATABASE ${scratchName}`);
  await runMigrations(scratchUrl.toString());

  // The db module reads DATABASE_URL at import time, so point it at the scratch database first.
  process.env.DATABASE_URL = scratchUrl.toString();
  const dbModule = await import("../../db/index.js");
  pool = dbModule.pool;
  ({ InvitationsService: Inv } = await import("./invitations.service.js"));
  ({ GraduatesService: Grad } = await import("../graduates/graduates.service.js"));
  invitations = new Inv();
  graduates = new Grad();
});

let Inv: typeof import("./invitations.service.js").InvitationsService;
let Grad: typeof import("../graduates/graduates.service.js").GraduatesService;

afterAll(async () => {
  await pool?.end();
  if (!admin) return;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.end();
});

async function auditActions(): Promise<string[]> {
  const { rows } = await pool!.query<{ action: string }>("SELECT action FROM audit ORDER BY id");
  return rows.map((r) => r.action);
}

describe("invitations admin flow (real Postgres)", () => {
  it("adds graduates, rejects duplicate emails, and audits without PII", async (ctx) => {
    if (!admin) return ctx.skip();
    const ann = await graduates.createGraduate({ name: "Ann", email: "ann@example.com" }, "tester");
    await graduates.createGraduate({ name: "Bao", email: "bao@example.com" }, "tester");
    await expect(
      graduates.createGraduate({ name: "Ann again", email: "ann@example.com" }, "tester"),
    ).rejects.toThrow("already exists");

    expect((await graduates.listGraduates()).items.map((g) => g.name)).toEqual(["Ann", "Bao"]);
    const { rows } = await pool!.query("SELECT * FROM audit WHERE action = 'graduate.create'");
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows)).not.toContain("ann@example.com");
    expect(rows[0].target_id).toBe(ann.id);
  });

  it("rejects an unknown inviter and writes nothing", async (ctx) => {
    if (!admin) return ctx.skip();
    const before = await auditActions();
    await expect(
      invitations.issueInvitation(
        { guestName: "Ghost", inviterUserIds: ["3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f"] },
        "tester",
      ),
    ).rejects.toThrow("inviters do not exist");
    expect(await auditActions()).toEqual(before);
    const { rows } = await pool!.query("SELECT 1 FROM guests WHERE name = 'Ghost'");
    expect(rows).toHaveLength(0);
  });

  it("creates, lists, rotates and revokes with one audit row each", async (ctx) => {
    if (!admin) return ctx.skip();
    const { items: grads } = await graduates.listGraduates();
    const created = await invitations.issueInvitation(
      { guestName: "Secret Guest", inviterUserIds: grads.map((g) => g.id), maxPlusOnes: 1 },
      "tester",
    );

    const list = await invitations.listInvitations();
    expect(list.items[0].id).toBe(created.invitationId);
    expect(list.items[0].inviters.map((i) => i.name)).toEqual(["Ann", "Bao"]);
    expect(JSON.stringify(list)).not.toContain(created.token);

    const rotated = await invitations.rotateInvitationToken(created.invitationId, "tester");
    expect(rotated?.token).not.toBe(created.token);
    expect((await invitations.resolveByToken(rotated!.token)).status).toBe("ok");

    const first = await invitations.revokeInvitation(created.invitationId, "tester");
    const second = await invitations.revokeInvitation(created.invitationId, "tester");
    expect(first?.status).toBe("revoked");
    expect(second).toEqual(first);
    expect((await invitations.resolveByToken(rotated!.token)).status).toBe("invalid");
    expect(await invitations.rotateInvitationToken(created.invitationId, "tester")).toBeNull();
    expect(await invitations.revokeInvitation("3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f", "tester")).toBeNull();

    expect((await auditActions()).filter((a) => a.startsWith("invitation."))).toEqual([
      "invitation.create",
      "invitation.rotate",
      "invitation.revoke",
    ]);
    const { rows } = await pool!.query("SELECT metadata FROM audit WHERE action LIKE 'invitation.%'");
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain("Secret Guest");
    expect(dump).not.toContain(created.token);
  });
});
