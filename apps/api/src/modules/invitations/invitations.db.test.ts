import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config.js";
import { runMigrations } from "../../migrate.js";

/**
 * Real-Postgres check of the admin write paths, in its own scratch database
 * (never the shared grad26 data). Skips locally when Postgres is unreachable.
 */
const baseUrl = new URL(loadConfig(process.env).databaseUrl);
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

  // config.ts and the db module read DATABASE_URL at import time, and this file already
  // imported config above. Point the environment at the scratch database, then reset the
  // module cache so config, the pool and the services are re-created against it. Without
  // the reset they would silently use the shared grad26 database.
  process.env.DATABASE_URL = scratchUrl.toString();
  vi.resetModules();
  const dbModule = await import("../../db/index.js");
  const { config: scratchConfig } = await import("../../config.js");
  if (scratchConfig.databaseUrl !== scratchUrl.toString()) {
    throw new Error("refusing to run: the db module is not pointed at the scratch database");
  }
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

  it("splits given and family names, exposes the given name to the guest, and lets admins review it (#170)", async (ctx) => {
    if (!admin) return ctx.skip();
    const { items: grads } = await graduates.listGraduates();
    const inviterUserIds = [grads[0]!.id];

    const vietnamese = await invitations.issueInvitation({ guestName: "Nguyễn Văn An", inviterUserIds }, "tester");
    expect(vietnamese.guest).toMatchObject({ givenName: "An", familyName: "Nguyễn" });
    const me = await invitations.resolveByToken(vietnamese.token);
    expect(me).toMatchObject({ status: "ok", invitation: { guest: { name: "Nguyễn Văn An", givenName: "An" } } });

    const western = await invitations.issueInvitation({ guestName: "John Smith", inviterUserIds, maxPlusOnes: 2 }, "tester");
    expect(western.guest).toMatchObject({ givenName: "John", familyName: "Smith" });

    const explicit = await invitations.issueInvitation(
      { guestName: "Bà Lê Thị Hoa", guestGivenName: "Hoa", guestFamilyName: "Lê", inviterUserIds },
      "tester",
    );
    const rowOf = async (id: string) => (await invitations.listInvitations()).items.find((r) => r.id === id)!;
    expect((await rowOf(explicit.invitationId)).guest).toMatchObject({ givenName: "Hoa", nameReviewed: true });
    expect((await rowOf(vietnamese.invitationId)).guest.nameReviewed).toBe(false);

    // Confirm the guess; then fix a name, which stays reviewed.
    expect((await invitations.updateInvitation(vietnamese.invitationId, { nameReviewed: true }, "tester"))?.guest).toMatchObject({
      givenName: "An",
      nameReviewed: true,
    });
    const fixed = await invitations.updateInvitation(
      western.invitationId,
      { guestGivenName: "Johnny", guestEmail: "john@example.com", maxPlusOnes: 1 },
      "tester",
    );
    expect(fixed).toMatchObject({ maxPlusOnes: 1, guest: { givenName: "Johnny", familyName: "Smith", email: "john@example.com", nameReviewed: true } });

    // A new full name alone is re-split and needs review again.
    const renamed = await invitations.updateInvitation(western.invitationId, { guestName: "Trần Minh Khoa" }, "tester");
    expect(renamed?.guest).toMatchObject({ name: "Trần Minh Khoa", givenName: "Khoa", familyName: "Trần", nameReviewed: false });

    expect(await invitations.updateInvitation("3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f", { maxPlusOnes: 1 }, "tester")).toBeNull();

    const { rows } = await pool!.query("SELECT target_id, metadata FROM audit WHERE action = 'invitation.update' ORDER BY id");
    expect(rows.map((r) => r.metadata)).toEqual([
      { fields: ["nameReviewed"] },
      { fields: ["guestEmail", "guestGivenName", "maxPlusOnes"] },
      { fields: ["guestName"] },
    ]);
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain("john@example.com");
    expect(dump).not.toContain("Johnny");
  });

  it("refuses to lower maxPlusOnes below the plus-ones a guest already confirmed", async (ctx) => {
    if (!admin) return ctx.skip();
    const { items: grads } = await graduates.listGraduates();
    const created = await invitations.issueInvitation({ guestName: "Plus Guest", inviterUserIds: [grads[0]!.id], maxPlusOnes: 2 }, "tester");
    await pool!.query("INSERT INTO rsvp (invitation_id, attending, plus_ones_count) VALUES ($1, true, 2)", [created.invitationId]);
    await expect(invitations.updateInvitation(created.invitationId, { maxPlusOnes: 1 }, "tester")).rejects.toThrow("plus-ones");
    expect((await invitations.updateInvitation(created.invitationId, { maxPlusOnes: 3 }, "tester"))?.maxPlusOnes).toBe(3);
  });

  it("splits graduate names and edits them with audit by field name only", async (ctx) => {
    if (!admin) return ctx.skip();
    const created = await graduates.createGraduate({ name: "Phạm Thu Trang", email: "trang@example.com" }, "tester");
    expect(created).toMatchObject({ givenName: "Trang", familyName: "Phạm", nameReviewed: false });
    const explicit = await graduates.createGraduate({ name: "Mai Tran", givenName: "Mai", familyName: "Tran", email: "mai@example.com" }, "tester");
    expect(explicit).toMatchObject({ givenName: "Mai", nameReviewed: true });

    const updated = await graduates.updateGraduate(created.id, { familyName: "Phạm Thị", email: "thu.trang@example.com" }, "tester");
    expect(updated).toMatchObject({ givenName: "Trang", familyName: "Phạm Thị", email: "thu.trang@example.com", nameReviewed: true });
    await expect(graduates.updateGraduate(created.id, { email: "mai@example.com" }, "tester")).rejects.toThrow("already exists");
    expect(await graduates.updateGraduate("3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f", { name: "Nobody" }, "tester")).toBeNull();

    const { rows } = await pool!.query("SELECT metadata FROM audit WHERE action = 'graduate.update'");
    expect(rows).toEqual([{ metadata: { fields: ["email", "familyName"] } }]);
  });
});
