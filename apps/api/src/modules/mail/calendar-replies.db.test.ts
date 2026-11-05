import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hashToken } from "../../auth/tokens.js";
import { loadConfig } from "../../config.js";
import { runMigrations } from "../../migrate.js";

/**
 * Real-Postgres check of calendar RSVP replies (ADR-013) in a scratch database
 * (never the shared grad26 data). Skips locally when Postgres is unreachable.
 */
const baseUrl = new URL(loadConfig(process.env).databaseUrl);
const adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";
const scratchName = `grad_calendar_replies_test_${process.pid}`;
const scratchUrl = new URL(baseUrl);
scratchUrl.pathname = `/${scratchName}`;

let admin: pg.Client | undefined;
let pool: pg.Pool | undefined;
let repository: InstanceType<typeof import("./calendar-replies.js").CalendarReplyRepository>;
let invitationId: string;

beforeAll(async () => {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
  } catch (err) {
    if (process.env.CI) throw err;
    console.warn("Postgres unreachable, skipping calendar reply DB tests (run `pnpm db:up`)");
    return;
  }
  admin = client;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName}`);
  await admin.query(`CREATE DATABASE ${scratchName}`);
  await runMigrations(scratchUrl.toString());

  process.env.DATABASE_URL = scratchUrl.toString();
  vi.resetModules();
  const dbModule = await import("../../db/index.js");
  const { config: scratchConfig } = await import("../../config.js");
  if (scratchConfig.databaseUrl !== scratchUrl.toString()) {
    throw new Error("refusing to run: the db module is not pointed at the scratch database");
  }
  pool = dbModule.pool;
  const { CalendarReplyRepository } = await import("./calendar-replies.js");
  repository = new CalendarReplyRepository();

  const { rows } = await pool.query<{ id: string }>(
    `WITH g AS (INSERT INTO guests (name, email) VALUES ('An Nguyen', 'an@example.com') RETURNING id)
     INSERT INTO invitations (guest_id, token_hash, max_plus_ones) SELECT id, $1, 2 FROM g RETURNING id`,
    [hashToken("calendar-reply-db-test")],
  );
  invitationId = rows[0]!.id;
});

afterAll(async () => {
  await pool?.end();
  if (!admin) return;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.end();
});

describe("calendar replies (real Postgres)", () => {
  it("creates an RSVP from a Yes, then a No clears plus-ones and keeps the guest's notes", async (ctx) => {
    if (!admin) return ctx.skip();
    expect(await repository.findInvitation(invitationId)).toMatchObject({ guestEmail: "an@example.com", status: "active", rsvp: null });

    await repository.applyAttendance(invitationId, true);
    expect((await repository.findInvitation(invitationId))?.rsvp).toMatchObject({ attending: true });

    await pool!.query("UPDATE rsvp SET plus_ones_count = 2, notes = 'Vegetarian' WHERE invitation_id = $1", [invitationId]);
    await repository.applyAttendance(invitationId, true);
    let { rows } = await pool!.query("SELECT attending, plus_ones_count, notes FROM rsvp WHERE invitation_id = $1", [invitationId]);
    expect(rows[0]).toEqual({ attending: true, plus_ones_count: 2, notes: "Vegetarian" });

    await repository.applyAttendance(invitationId, false);
    ({ rows } = await pool!.query("SELECT attending, plus_ones_count, notes FROM rsvp WHERE invitation_id = $1", [invitationId]));
    expect(rows[0]).toEqual({ attending: false, plus_ones_count: 0, notes: "Vegetarian" });
  });

  it("remembers the mailbox cursor", async (ctx) => {
    if (!admin) return ctx.skip();
    expect(await repository.getCursor("INBOX")).toBeNull();
    await repository.saveCursor("INBOX", 7, 41);
    await repository.saveCursor("INBOX", 7, 42);
    expect(await repository.getCursor("INBOX")).toEqual({ uidValidity: 7, lastUid: 42 });
  });

  it("confirms an applied reply through the real queue, and the job finds it is the newest save", async (ctx) => {
    if (!admin) return ctx.skip();
    const { rows } = await pool!.query<{ id: string }>(
      `WITH g AS (INSERT INTO guests (name, email) VALUES ('Binh Le', 'binh@example.com') RETURNING id)
       INSERT INTO invitations (guest_id, token_hash, max_plus_ones) SELECT id, $1, 0 FROM g RETURNING id`,
      [hashToken("calendar-reply-db-test-2")],
    );
    const id = rows[0]!.id;
    const { JobQueue } = await import("../../worker/queue.js");
    const { pollCalendarReplies } = await import("./calendar-replies.js");
    const { RSVP_CONFIRMATION_JOB, rsvpConfirmationHandler } = await import("./rsvp-confirmation.js");
    const queue = new JobQueue(pool!);
    const reply = [
      "BEGIN:VCALENDAR",
      "METHOD:REPLY",
      "BEGIN:VEVENT",
      `UID:invite-${id}@grad26.example.com`,
      "DTSTAMP:20261020T081500Z",
      "ATTENDEE;PARTSTAT=ACCEPTED:mailto:binh@example.com",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const counts = await pollCalendarReplies({
      reader: {
        read: async () => ({
          uidValidity: 7,
          uidNext: 100,
          messages: [
            { uid: 99, from: "binh@example.com", authenticationResults: "mx.google.com; dmarc=pass header.from=example.com", calendarParts: [reply] },
          ],
        }),
      },
      store: repository,
      uidDomain: "grad26.example.com",
      authservId: "mx.google.com",
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      confirmations: queue,
    });
    expect(counts.applied).toBe(1);

    const jobs = await pool!.query<{ payload: { invitationId: string; rsvpUpdatedAt: string }; type: string }>(
      "SELECT type, payload FROM jobs WHERE payload->>'invitationId' = $1",
      [id],
    );
    expect(jobs.rows).toHaveLength(1);
    expect(jobs.rows[0]!.type).toBe(RSVP_CONFIRMATION_JOB);
    expect(Object.keys(jobs.rows[0]!.payload).sort()).toEqual(["invitationId", "rsvpUpdatedAt"]);

    const sendRsvpConfirmation = vi.fn(async () => "sent" as const);
    await rsvpConfirmationHandler({ mail: { sendRsvpConfirmation } })({ payload: jobs.rows[0]!.payload } as never);
    expect(sendRsvpConfirmation).toHaveBeenCalledWith(expect.objectContaining({ to: "binh@example.com", attending: true }));
  });
});
