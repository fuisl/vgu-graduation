import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config.js";
import { runMigrations } from "../../migrate.js";

/**
 * Real-Postgres check of admin access requests and decisions (#119), in its own
 * scratch database. Skips locally when Postgres is unreachable.
 */
const baseUrl = new URL(loadConfig(process.env).databaseUrl);
const adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";
const scratchName = `grad_admin_accounts_test_${process.pid}`;
const scratchUrl = new URL(baseUrl);
scratchUrl.pathname = `/${scratchName}`;

let admin: pg.Client | undefined;
let pool: pg.Pool | undefined;
let repository: InstanceType<typeof import("./admin-accounts.repository.js").AdminAccountsRepository>;

beforeAll(async () => {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
  } catch (err) {
    if (process.env.CI) throw err;
    console.warn("Postgres unreachable, skipping admin accounts DB tests (run `pnpm db:up`)");
    return;
  }
  admin = client;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName}`);
  await admin.query(`CREATE DATABASE ${scratchName}`);
  await runMigrations(scratchUrl.toString());

  // Same module reset as invitations.db.test.ts: the db module must point at the scratch database.
  process.env.DATABASE_URL = scratchUrl.toString();
  vi.resetModules();
  const dbModule = await import("../../db/index.js");
  const { config: scratchConfig } = await import("../../config.js");
  if (scratchConfig.databaseUrl !== scratchUrl.toString()) {
    throw new Error("refusing to run: the db module is not pointed at the scratch database");
  }
  pool = dbModule.pool;
  const { AdminAccountsRepository } = await import("./admin-accounts.repository.js");
  repository = new AdminAccountsRepository();
});

afterAll(async () => {
  await pool?.end();
  if (!admin) return;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.end();
});

async function auditActions(handle: string) {
  const { rows } = await pool!.query<{ actor: string; action: string }>(
    "SELECT actor, action FROM audit WHERE target_type = 'admin' AND target_id = $1 ORDER BY id",
    [handle],
  );
  return rows;
}

describe("AdminAccountsRepository", () => {
  it("files one pending request per handle and audits it once", async (ctx) => {
    if (!admin) return ctx.skip();
    expect(await repository.requestAccess("newgrad")).toBe("pending");
    expect(await repository.requestAccess("newgrad")).toBe("pending");
    expect(await auditActions("newgrad")).toEqual([{ actor: "newgrad", action: "admin.request" }]);
  });

  it("approves, revokes and re-approves with the owner as actor", async (ctx) => {
    if (!admin) return ctx.skip();
    await repository.requestAccess("cycle");
    const approved = await repository.decide("cycle", "approve", "fuisl");
    expect(approved).toMatchObject({ status: "ok", account: { status: "approved", decidedBy: "fuisl" } });
    expect(await repository.getStatus("cycle")).toBe("approved");

    expect(await repository.decide("cycle", "revoke", "fuisl")).toMatchObject({ account: { status: "revoked" } });
    expect(await repository.decide("cycle", "approve", "fuisl")).toMatchObject({ account: { status: "approved" } });
    expect((await auditActions("cycle")).map((r) => r.action)).toEqual([
      "admin.request",
      "admin.approve",
      "admin.revoke",
      "admin.approve",
    ]);
  });

  it("refuses transitions that do not apply and unknown handles, without auditing", async (ctx) => {
    if (!admin) return ctx.skip();
    await repository.requestAccess("waiting");
    expect(await repository.decide("waiting", "revoke", "fuisl")).toEqual({ status: "conflict", current: "pending" });
    expect(await repository.decide("ghost", "approve", "fuisl")).toEqual({ status: "not_found" });
    expect(await auditActions("waiting")).toHaveLength(1);
  });

  it("keeps a rejected account rejected on a repeat sign-in", async (ctx) => {
    if (!admin) return ctx.skip();
    await repository.requestAccess("nope");
    await repository.decide("nope", "reject", "fuisl");
    expect(await repository.requestAccess("nope")).toBe("rejected");
  });

  it("lists the seeded admins", async (ctx) => {
    if (!admin) return ctx.skip();
    const handles = (await repository.list()).filter((a) => a.decidedBy === "seed").map((a) => a.githubHandle);
    expect(handles.sort()).toEqual(["andrwpham", "dducwsxuaan", "fuisl", "nhientruong04"]);
  });
});
