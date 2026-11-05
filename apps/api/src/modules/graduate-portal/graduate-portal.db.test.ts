import fs from "node:fs";
import path from "node:path";
import { SignJWT } from "jose";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hashToken } from "../../auth/tokens.js";
import { loadConfig } from "../../config.js";
import { runMigrations } from "../../migrate.js";
import { approvedTester } from "../admin/admin-accounts.fake.js";
import { fakeMailer } from "../mail/mailer.fake.js";

/**
 * Real-Postgres, real-routes check of the graduate portal (ADR-017), in its own scratch database
 * (never the shared grad26 data), with a fake mailer. Skips locally when Postgres is unreachable.
 */
const baseUrl = new URL(loadConfig(process.env).databaseUrl);
const adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";
const scratchName = `grad_portal_test_${process.pid}`;
const scratchUrl = new URL(baseUrl);
scratchUrl.pathname = `/${scratchName}`;

const ORIGIN = "https://grad26.example.com";
const SECRET = "dev-only-change-me";

let admin: pg.Client | undefined;
let pool: pg.Pool | undefined;
let app: import("fastify").FastifyInstance;
let mailer: ReturnType<typeof fakeMailer>;
let portal: InstanceType<typeof import("./graduate-portal.repository.js").GraduatePortalRepository>;

beforeAll(async () => {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
  } catch (err) {
    if (process.env.CI) throw err;
    console.warn("Postgres unreachable, skipping graduate portal DB tests (run `pnpm db:up`)");
    return;
  }
  admin = client;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName}`);
  await admin.query(`CREATE DATABASE ${scratchName}`);
  await runMigrations(scratchUrl.toString());

  // config.ts and the db module read DATABASE_URL at import time: point it at the scratch
  // database and reset the module cache, as invitations.db.test.ts explains.
  process.env.DATABASE_URL = scratchUrl.toString();
  process.env.ADMIN_SESSION_SECRET = SECRET;
  vi.resetModules();
  const dbModule = await import("../../db/index.js");
  const { config: scratchConfig, loadConfig: load } = await import("../../config.js");
  if (scratchConfig.databaseUrl !== scratchUrl.toString()) {
    throw new Error("refusing to run: the db module is not pointed at the scratch database");
  }
  pool = dbModule.pool;

  const { buildServer } = await import("../../server.js");
  const { MailService } = await import("../mail/mail.service.js");
  const { JoinRepository } = await import("../join/join.repository.js");
  const { JoinService } = await import("../join/join.service.js");
  const { GraduatePortalRepository } = await import("./graduate-portal.repository.js");
  const { GraduatePortalService } = await import("./graduate-portal.service.js");
  const { GraduateSignInIssuer } = await import("./sign-in-issuer.js");

  await pool.query(`
    INSERT INTO event_config (name, starts_at, time_zone, venue_name, venue_address)
    SELECT 'VGU Graduation 2026', '2026-11-20T02:00:00Z', 'Asia/Ho_Chi_Minh', 'Ceremony Hall', 'Ring Road 4'
    WHERE NOT EXISTS (SELECT 1 FROM event_config)`);
  mailer = fakeMailer();
  const mail = new MailService(mailer.mailer, undefined, { publicOrigin: ORIGIN, apiOrigin: "https://api.example.com" });
  portal = new GraduatePortalRepository();
  const join = new JoinService(new JoinRepository(), mail, ORIGIN, undefined, new GraduateSignInIssuer(portal));
  app = buildServer({
    adminAccounts: approvedTester(),
    config: load({ ...process.env, LOG_LEVEL: "silent" }),
    join: { service: join },
    graduatePortal: { service: new GraduatePortalService(portal, join) },
  });
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
  if (!admin) return;
  await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
  await admin.end();
});

let counter = 0;

/** A made-up graduate, signed in the whole way: request the email, read the link out of it, confirm. */
async function signedIn(): Promise<{ id: string; email: string; session: string; signIn: string; joinUrl: string }> {
  counter += 1;
  const email = `graduate${counter}@example.com`;
  const { rows } = await pool!.query<{ id: string }>(
    "INSERT INTO users (name, given_name, email, role) VALUES ($1, $2, $3, 'graduate') RETURNING id",
    [`Graduate ${counter}`, `Graduate${counter}`, email],
  );
  const { signIn, joinUrl } = await requestLinks(email);
  const res = await app.inject({ method: "POST", url: "/graduate/sessions", payload: { token: signIn } });
  expect(res.statusCode).toBe(201);
  return { id: rows[0].id, email, session: res.json().token, signIn, joinUrl };
}

async function requestLinks(email: string): Promise<{ signIn: string; joinUrl: string }> {
  const before = mailer.sent.length;
  expect((await app.inject({ method: "POST", url: "/join-links/request", payload: { email } })).statusCode).toBe(202);
  await vi.waitFor(() => expect(mailer.sent.length).toBe(before + 1));
  const text = mailer.sent[before].text;
  return {
    signIn: /\/graduate\/sign-in\/([\w-]+)/.exec(text)![1],
    joinUrl: /https:\S+\/join\/[\w-]+/.exec(text)![0],
  };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const list = async (session: string) => (await app.inject({ method: "GET", url: "/graduate/guests", headers: bearer(session) })).json().items as { id: string; name: string; removal: string; status: string; answeredAt: string | null }[];

async function invite(session: string, name: string, email: string) {
  return app.inject({ method: "POST", url: "/graduate/guests", headers: bearer(session), payload: { name, email } });
}

/** Everything no-rotation protects, by primary key. */
async function credentials() {
  const codes = await pool!.query("SELECT id, join_code FROM users ORDER BY id");
  const hashes = await pool!.query("SELECT id, token_hash FROM invitations ORDER BY id");
  return { codes: codes.rows, hashes: hashes.rows };
}

describe("signing in", () => {
  it("spends the emailed token once, and only stores hashes", async (ctx) => {
    if (!admin) return ctx.skip();
    const ann = await signedIn();
    expect((await app.inject({ method: "POST", url: "/graduate/sessions", payload: { token: ann.signIn } })).statusCode).toBe(401);

    const { rows: tokens } = await pool!.query("SELECT token_hash, consumed_at, expires_at, created_at FROM graduate_sign_in_tokens WHERE user_id = $1", [ann.id]);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].token_hash).toBe(hashToken(ann.signIn));
    expect(tokens[0].consumed_at).not.toBeNull();
    expect(tokens[0].expires_at.getTime() - tokens[0].created_at.getTime()).toBeLessThanOrEqual(30 * 60 * 1000 + 5000);

    const { rows: sessions } = await pool!.query("SELECT token_hash, expires_at FROM graduate_sessions WHERE user_id = $1", [ann.id]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].token_hash).toBe(hashToken(ann.session));
    expect(sessions[0].expires_at.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
  });

  it("issuing a second link doesn't touch the first, so a scanner's request can't lock anyone out", async (ctx) => {
    if (!admin) return ctx.skip();
    const ann = await signedIn();
    const first = await requestLinks(ann.email);
    const second = await requestLinks(ann.email);
    expect(first.signIn).not.toBe(second.signIn);
    expect(first.joinUrl).toBe(ann.joinUrl);
    expect(second.joinUrl).toBe(ann.joinUrl);
    expect((await app.inject({ method: "POST", url: "/graduate/sessions", payload: { token: first.signIn } })).statusCode).toBe(201);
    expect((await app.inject({ method: "POST", url: "/graduate/sessions", payload: { token: second.signIn } })).statusCode).toBe(201);
  });

  it("refuses an expired sign-in token and an expired or revoked session", async (ctx) => {
    if (!admin) return ctx.skip();
    const ann = await signedIn();
    const { signIn } = await requestLinks(ann.email);
    await pool!.query("UPDATE graduate_sign_in_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = $1", [hashToken(signIn)]);
    expect((await app.inject({ method: "POST", url: "/graduate/sessions", payload: { token: signIn } })).statusCode).toBe(401);

    expect((await app.inject({ method: "GET", url: "/graduate/me", headers: bearer(ann.session) })).statusCode).toBe(200);
    await pool!.query("UPDATE graduate_sessions SET expires_at = now() - interval '1 second' WHERE token_hash = $1", [hashToken(ann.session)]);
    expect((await app.inject({ method: "GET", url: "/graduate/me", headers: bearer(ann.session) })).statusCode).toBe(401);
  });

  it("signing out ends that session at once and only that one", async (ctx) => {
    if (!admin) return ctx.skip();
    const ann = await signedIn();
    const { signIn } = await requestLinks(ann.email);
    const other = (await app.inject({ method: "POST", url: "/graduate/sessions", payload: { token: signIn } })).json().token as string;
    expect((await app.inject({ method: "DELETE", url: "/graduate/sessions/current", headers: bearer(ann.session) })).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/graduate/me", headers: bearer(ann.session) })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/graduate/me", headers: bearer(other) })).statusCode).toBe(200);
  });
});

describe("credentials stay in their own lane", () => {
  it("a join code, an invitation token, an admin session and a sign-in token open no graduate route", async (ctx) => {
    if (!admin) return ctx.skip();
    const ann = await signedIn();
    const joinCode = ann.joinUrl.split("/").pop()!;
    await invite(ann.session, "Lane Guest", "lane.guest@example.com");
    const inviteToken = /\/invite\/([\w-]+)/.exec(mailer.sent.at(-1)!.text)![1];
    expect((await app.inject({ method: "GET", url: "/invitations/me", headers: bearer(inviteToken) })).statusCode).toBe(200);
    const adminJwt = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject("tester").setExpirationTime("5m").sign(new TextEncoder().encode(SECRET));
    expect((await app.inject({ method: "GET", url: "/admin/graduates", headers: bearer(adminJwt) })).statusCode).toBe(200);
    const { signIn } = await requestLinks(ann.email);

    for (const url of ["/graduate/me", "/graduate/guests"]) {
      for (const token of [joinCode, inviteToken, adminJwt, signIn]) {
        expect((await app.inject({ method: "GET", url, headers: bearer(token) })).statusCode, url).toBe(401);
      }
      for (const cookie of [`inv=${inviteToken}`, `inv=${ann.session}`, `grad_portal=${ann.session}`]) {
        expect((await app.inject({ method: "GET", url, headers: { cookie } })).statusCode, url).toBe(401);
      }
    }
  });

  it("a session token opens no guest or admin route, as a header or a cookie", async (ctx) => {
    if (!admin) return ctx.skip();
    const ann = await signedIn();
    for (const url of ["/invitations/me", "/pass"]) {
      expect((await app.inject({ method: "GET", url, headers: bearer(ann.session) })).statusCode, url).toBe(404);
      expect((await app.inject({ method: "GET", url, headers: { cookie: `inv=${ann.session}` } })).statusCode, url).toBe(404);
    }
    for (const url of ["/admin/graduates", "/admin/invitations"]) {
      expect((await app.inject({ method: "GET", url, headers: bearer(ann.session) })).statusCode, url).toBe(401);
    }
    // The sign-in token and the join code aren't guest credentials either.
    expect((await app.inject({ method: "GET", url: "/invitations/me", headers: bearer(ann.signIn) })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/invitations/me", headers: bearer(ann.joinUrl.split("/").pop()!) })).statusCode).toBe(404);
  });
});

describe("a graduate's guests", () => {
  it("lists only their own, with only the dashboard's fields and the RSVP state", async (ctx) => {
    if (!admin) return ctx.skip();
    const a = await signedIn();
    const b = await signedIn();
    expect((await invite(a.session, "Own Guest", "own.guest@example.com")).json()).toEqual({ status: "invited" });
    expect((await invite(b.session, "Other Guest", "other.guest@example.com")).json()).toEqual({ status: "invited" });

    const mine = await list(a.session);
    expect(mine.map((g) => g.name)).toEqual(["Own Guest"]);
    expect(mine[0]).toMatchObject({ status: "pending", answeredAt: null, removal: "revoke" });

    await pool!.query("INSERT INTO rsvp (invitation_id, attending, dietary_requirements, notes) VALUES ($1, true, 'secret-diet', 'secret-note')", [mine[0].id]);
    await pool!.query("INSERT INTO rsvp_accessibility (rsvp_id, note) SELECT id, 'secret-needs' FROM rsvp WHERE invitation_id = $1", [mine[0].id]);
    const res = await app.inject({ method: "GET", url: "/graduate/guests", headers: bearer(a.session) });
    const body = res.body;
    for (const secret of ["secret-diet", "secret-note", "secret-needs", "token", "inviters", "Graduate", "phone"]) {
      expect(body).not.toContain(secret);
    }
    expect(res.json().items[0]).toMatchObject({ status: "attending", removal: "revoke" });
    expect(res.json().items[0].answeredAt).toEqual(expect.any(String));

    await pool!.query("UPDATE rsvp SET attending = false WHERE invitation_id = $1", [mine[0].id]);
    expect((await list(a.session))[0].status).toBe("declined");
  });

  it("gives 404 on another graduate's guest and changes nothing", async (ctx) => {
    if (!admin) return ctx.skip();
    const a = await signedIn();
    const b = await signedIn();
    await invite(b.session, "Not Yours", "not.yours@example.com");
    const [guest] = await list(b.session);
    const before = await credentials();

    expect((await app.inject({ method: "DELETE", url: `/graduate/guests/${guest.id}`, headers: bearer(a.session) })).statusCode).toBe(404);

    const { rows } = await pool!.query("SELECT status FROM invitations WHERE id = $1", [guest.id]);
    expect(rows[0].status).toBe("active");
    expect((await list(b.session)).map((g) => g.id)).toEqual([guest.id]);
    expect(await credentials()).toEqual(before);
  });

  it("an already-invited address adds this graduate as co-inviter with no email and no new link", async (ctx) => {
    if (!admin) return ctx.skip();
    const a = await signedIn();
    const b = await signedIn();
    await invite(a.session, "Shared Guest", "shared.guest@example.com");
    const sent = mailer.sent.length;
    const before = await credentials();
    const again = await invite(b.session, "Typed Differently", "SHARED.guest@example.com");
    expect(again.statusCode).toBe(201);
    expect(again.json()).toEqual({ status: "already_invited" });
    expect(mailer.sent.length).toBe(sent);
    expect(await credentials()).toEqual(before);

    const [forB] = await list(b.session);
    expect(forB).toMatchObject({ name: "Shared Guest", removal: "unlink" });
    const body = (await app.inject({ method: "GET", url: "/graduate/guests", headers: bearer(b.session) })).body;
    expect(body).not.toContain("Graduate");
    const { rows } = await pool!.query("SELECT actor FROM audit WHERE action = 'invitation.join_add_inviter' AND target_id = $1", [forB.id]);
    expect(rows).toEqual([{ actor: `graduate:${b.id}` }]);
  });

  it("keeps nothing if the invitation email can't be sent", async (ctx) => {
    if (!admin) return ctx.skip();
    const a = await signedIn();
    mailer.fail();
    expect((await invite(a.session, "Bounced", "bounced@example.com")).statusCode).toBe(502);
    mailer.fail(false);
    expect(await list(a.session)).toEqual([]);
    const { rows } = await pool!.query("SELECT count(*)::int AS n FROM guests WHERE email = 'bounced@example.com'");
    expect(rows[0].n).toBe(0);
  });
});

describe("removing a guest", () => {
  it("revokes when this graduate was the only inviter: the link dies, the RSVP stays, the audit has ids only", async (ctx) => {
    if (!admin) return ctx.skip();
    const a = await signedIn();
    await invite(a.session, "Sole Guest", "sole.guest@example.com");
    const inviteToken = /\/invite\/([\w-]+)/.exec(mailer.sent.at(-1)!.text)![1];
    const [guest] = await list(a.session);
    await pool!.query("INSERT INTO rsvp (invitation_id, attending) VALUES ($1, true)", [guest.id]);
    const { rows: hashBefore } = await pool!.query("SELECT token_hash FROM invitations WHERE id = $1", [guest.id]);

    const res = await app.inject({ method: "DELETE", url: `/graduate/guests/${guest.id}`, headers: bearer(a.session) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ outcome: "revoked" });

    expect((await app.inject({ method: "GET", url: "/invitations/me", headers: bearer(inviteToken) })).statusCode).toBe(404);
    const { rows: invitation } = await pool!.query("SELECT status, token_hash FROM invitations WHERE id = $1", [guest.id]);
    expect(invitation[0].status).toBe("revoked");
    expect(invitation[0].token_hash).toBe(hashBefore[0].token_hash);
    const { rows: rsvp } = await pool!.query("SELECT attending FROM rsvp WHERE invitation_id = $1", [guest.id]);
    expect(rsvp).toEqual([{ attending: true }]);
    expect(await list(a.session)).toEqual([]);
    expect((await app.inject({ method: "DELETE", url: `/graduate/guests/${guest.id}`, headers: bearer(a.session) })).statusCode).toBe(404);

    const { rows: audit } = await pool!.query("SELECT actor, action, metadata FROM audit WHERE target_id = $1 ORDER BY id", [guest.id]);
    expect(audit.map((r) => r.action)).toEqual(["invitation.join_create", "invitation.graduate_remove_inviter", "invitation.revoke"]);
    expect(audit.every((r) => r.actor === `graduate:${a.id}`)).toBe(true);
    expect(JSON.stringify(audit)).not.toContain("sole.guest");
    expect(JSON.stringify(audit)).not.toContain("Sole Guest");
  });

  it("leaves the invitation untouched when another graduate also invited them, and the last one out revokes", async (ctx) => {
    if (!admin) return ctx.skip();
    const a = await signedIn();
    const b = await signedIn();
    await invite(a.session, "Co Guest", "co.guest@example.com");
    const inviteToken = /\/invite\/([\w-]+)/.exec(mailer.sent.at(-1)!.text)![1];
    await invite(b.session, "Co Guest", "co.guest@example.com");
    const [guest] = await list(a.session);
    expect(guest.removal).toBe("unlink");

    const first = await app.inject({ method: "DELETE", url: `/graduate/guests/${guest.id}`, headers: bearer(a.session) });
    expect(first.json()).toEqual({ outcome: "unlinked" });
    expect((await app.inject({ method: "GET", url: "/invitations/me", headers: bearer(inviteToken) })).statusCode).toBe(200);
    expect(await list(a.session)).toEqual([]);
    const [forB] = await list(b.session);
    expect(forB.removal).toBe("revoke");

    const second = await app.inject({ method: "DELETE", url: `/graduate/guests/${guest.id}`, headers: bearer(b.session) });
    expect(second.json()).toEqual({ outcome: "revoked" });
    expect((await app.inject({ method: "GET", url: "/invitations/me", headers: bearer(inviteToken) })).statusCode).toBe(404);
  });

  it("settles two graduates removing the same guest at once with exactly one revoke", async (ctx) => {
    if (!admin) return ctx.skip();
    const a = await signedIn();
    const b = await signedIn();
    await invite(a.session, "Race Guest", "race.guest@example.com");
    await invite(b.session, "Race Guest", "race.guest@example.com");
    const [guest] = await list(a.session);
    const outcomes = await Promise.all([portal.removeGuest(a.id, guest.id), portal.removeGuest(b.id, guest.id)]);
    expect(outcomes.sort()).toEqual(["revoked", "unlinked"]);
    const { rows } = await pool!.query("SELECT status FROM invitations WHERE id = $1", [guest.id]);
    expect(rows[0].status).toBe("revoked");
    const { rows: revokes } = await pool!.query("SELECT count(*)::int AS n FROM audit WHERE action = 'invitation.revoke' AND target_id = $1", [guest.id]);
    expect(revokes[0].n).toBe(1);
  });

  it("the guest can be invited again: a new invitation and a new email, the old link still dead", async (ctx) => {
    if (!admin) return ctx.skip();
    const a = await signedIn();
    await invite(a.session, "Back Again", "back.again@example.com");
    const oldToken = /\/invite\/([\w-]+)/.exec(mailer.sent.at(-1)!.text)![1];
    const [guest] = await list(a.session);
    await app.inject({ method: "DELETE", url: `/graduate/guests/${guest.id}`, headers: bearer(a.session) });
    expect((await invite(a.session, "Back Again", "back.again@example.com")).json()).toEqual({ status: "invited" });
    const newToken = /\/invite\/([\w-]+)/.exec(mailer.sent.at(-1)!.text)![1];
    expect(newToken).not.toBe(oldToken);
    expect((await app.inject({ method: "GET", url: "/invitations/me", headers: bearer(newToken) })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/invitations/me", headers: bearer(oldToken) })).statusCode).toBe(404);
  });
});

/** An invitation as the admin form creates it, by the real repository. Returns its id. */
async function adminInvitation(inviterIds: string[], email: string): Promise<string> {
  const { InvitationsRepository } = await import("../invitations/invitations.repository.js");
  counter += 1;
  const created = await new InvitationsRepository().createInvitation(
    { guestName: `Organizer Guest ${counter}`, guestEmail: email, inviterUserIds: inviterIds },
    hashToken(`admin-invitation-${counter}-${process.pid}`),
    "tester",
  );
  return created.invitationId;
}

const remove = (session: string, id: string) => app.inject({ method: "DELETE", url: `/graduate/guests/${id}`, headers: bearer(session) });

async function linkState(id: string) {
  const inviters = await pool!.query("SELECT user_id, added_by FROM invitation_inviters WHERE invitation_id = $1 ORDER BY user_id", [id]);
  const invitation = await pool!.query("SELECT status, token_hash, created_by FROM invitations WHERE id = $1", [id]);
  const audit = await pool!.query("SELECT count(*)::int AS n FROM audit WHERE target_id = $1", [id]);
  return { inviters: inviters.rows, invitation: invitation.rows[0], audit: audit.rows[0].n };
}

describe("who added the link decides who can remove it", () => {
  it("refuses to remove a guest an admin added: 403, no Remove on the list, nothing changes", async (ctx) => {
    if (!admin) return ctx.skip();
    const a = await signedIn();
    const id = await adminInvitation([a.id], "organizer.only@example.com");
    const [guest] = await list(a.session);
    expect(guest).toMatchObject({ id, removal: "not_allowed" });
    const before = await linkState(id);
    expect(before.inviters).toEqual([{ user_id: a.id, added_by: "admin" }]);
    expect(before.invitation.created_by).toBe("admin");

    const res = await remove(a.session, id);
    expect(res.statusCode).toBe(403);
    expect(await linkState(id)).toEqual(before);
    expect(await list(a.session)).toHaveLength(1);
  });

  it("keeps an admin's link admin-added when the graduate types that address themselves", async (ctx) => {
    if (!admin) return ctx.skip();
    const a = await signedIn();
    const id = await adminInvitation([a.id], "organizer.retyped@example.com");
    expect((await invite(a.session, "Organizer Retyped", "organizer.retyped@example.com")).json()).toEqual({ status: "already_invited" });
    expect((await linkState(id)).inviters).toEqual([{ user_id: a.id, added_by: "admin" }]);
    expect((await remove(a.session, id)).statusCode).toBe(403);
  });

  it("lets a co-inviter of an admin's invitation leave, and never revokes it, even as the last inviter", async (ctx) => {
    if (!admin) return ctx.skip();
    const organizerGraduate = await signedIn();
    const a = await signedIn();
    const id = await adminInvitation([organizerGraduate.id], "organizer.shared@example.com");
    await invite(a.session, "Organizer Shared", "organizer.shared@example.com");
    const [guest] = await list(a.session);
    expect(guest).toMatchObject({ id, removal: "unlink" });
    expect((await remove(a.session, id)).json()).toEqual({ outcome: "unlinked" });
    expect((await linkState(id)).invitation.status).toBe("active");
    // The admin's graduate is still refused, and is still there.
    expect((await remove(organizerGraduate.session, id)).statusCode).toBe(403);
    expect((await linkState(id)).inviters).toEqual([{ user_id: organizerGraduate.id, added_by: "admin" }]);

    // The last inviter of an admin's invitation: the link goes, the invitation stays active.
    const sole = await signedIn();
    const lastId = await adminInvitation([sole.id], "organizer.last@example.com");
    await pool!.query("DELETE FROM invitation_inviters WHERE invitation_id = $1", [lastId]);
    const typed = await signedIn();
    await invite(typed.session, "Organizer Last", "organizer.last@example.com");
    const [only] = await list(typed.session);
    expect(only).toMatchObject({ id: lastId, removal: "unlink" });
    const hashBefore = (await linkState(lastId)).invitation.token_hash;
    expect((await remove(typed.session, lastId)).json()).toEqual({ outcome: "unlinked" });
    const after = await linkState(lastId);
    expect(after.inviters).toEqual([]);
    expect(after.invitation).toMatchObject({ status: "active", token_hash: hashBefore, created_by: "admin" });
    const { rows } = await pool!.query("SELECT count(*)::int AS n FROM audit WHERE action = 'invitation.revoke' AND target_id = $1", [lastId]);
    expect(rows[0].n).toBe(0);
  });

  it("still removes a guest brought in through the join link or the invite form, as before", async (ctx) => {
    if (!admin) return ctx.skip();
    const a = await signedIn();
    const code = a.joinUrl.split("/").pop()!;
    const joined = await app.inject({ method: "POST", url: `/join/${code}`, payload: { name: "Join Guest", email: "join.guest@example.com" } });
    expect(joined.statusCode).toBeLessThan(300);
    await invite(a.session, "Form Guest", "form.guest@example.com");
    const guests = await list(a.session);
    expect(guests.map((g) => g.removal)).toEqual(["revoke", "revoke"]);
    for (const guest of guests) {
      expect((await linkState(guest.id)).invitation.created_by).toBe("graduate");
      expect((await remove(a.session, guest.id)).json()).toEqual({ outcome: "revoked" });
    }
  });

  it("keeps someone else's guest 404, an admin-added one included", async (ctx) => {
    if (!admin) return ctx.skip();
    const a = await signedIn();
    const stranger = await signedIn();
    const id = await adminInvitation([a.id], "organizer.private@example.com");
    expect((await remove(stranger.session, id)).statusCode).toBe(404);
  });

  it("the backfill in migration 0012 recognises rows the real code writes", async (ctx) => {
    if (!admin) return ctx.skip();
    const a = await signedIn();
    const b = await signedIn();
    const code = a.joinUrl.split("/").pop()!;
    await app.inject({ method: "POST", url: `/join/${code}`, payload: { name: "Backfill Join", email: "backfill.join@example.com" } });
    await invite(a.session, "Backfill Form", "backfill.form@example.com");
    const organizerId = await adminInvitation([a.id], "backfill.organizer@example.com");
    await invite(b.session, "Backfill Organizer", "backfill.organizer@example.com");
    const ids = (await list(a.session)).map((g) => g.id);
    expect(ids).toHaveLength(3);
    const snapshot = async () => {
      const links = await pool!.query("SELECT invitation_id, user_id, added_by FROM invitation_inviters WHERE invitation_id = ANY($1) ORDER BY 1, 2", [ids]);
      const invitations = await pool!.query("SELECT id, created_by FROM invitations WHERE id = ANY($1) ORDER BY id", [ids]);
      return { links: links.rows, invitations: invitations.rows };
    };
    const written = await snapshot();

    // As an existing database would look just before the migration, then its own UPDATEs.
    await pool!.query("UPDATE invitation_inviters SET added_by = 'admin' WHERE invitation_id = ANY($1)", [ids]);
    await pool!.query("UPDATE invitations SET created_by = 'admin' WHERE id = ANY($1)", [ids]);
    const sql = fs.readFileSync(path.resolve(__dirname, "../../../drizzle/0012_graduate_link_origin.sql"), "utf8");
    const updates = sql.split("--> statement-breakpoint").map((s) => s.trim()).filter((s) => s.startsWith("UPDATE"));
    expect(updates).toHaveLength(2);
    for (const statement of updates) await pool!.query(statement);

    expect(await snapshot()).toEqual(written);
    expect(written.invitations.find((row) => row.id === organizerId)?.created_by).toBe("admin");
    expect(written.links.filter((row) => row.invitation_id === organizerId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ user_id: a.id, added_by: "admin" }),
        expect.objectContaining({ user_id: b.id, added_by: "graduate" }),
      ]),
    );
  });
});

describe("the owner's no-rotation rule", () => {
  it("signing in and using the whole portal leaves every join code and token hash exactly as they were", async (ctx) => {
    if (!admin) return ctx.skip();
    // A graduate who already has a join link, with guests already holding invitation links.
    const a = await signedIn();
    const b = await signedIn();
    await invite(b.session, "Existing Guest", "existing.guest@example.com");
    const existingToken = /\/invite\/([\w-]+)/.exec(mailer.sent.at(-1)!.text)![1];
    await invite(a.session, "Removed Later", "removed.later@example.com");
    const removedToken = /\/invite\/([\w-]+)/.exec(mailer.sent.at(-1)!.text)![1];
    const joinCode = a.joinUrl.split("/").pop()!;
    const before = await credentials();

    // The whole journey: ask again, sign in again, read everything, co-invite, remove, sign out.
    const { signIn, joinUrl } = await requestLinks(a.email);
    expect(joinUrl).toBe(a.joinUrl);
    const session = (await app.inject({ method: "POST", url: "/graduate/sessions", payload: { token: signIn } })).json().token as string;
    expect((await app.inject({ method: "GET", url: "/graduate/me", headers: bearer(session) })).json().joinUrl).toBe(a.joinUrl);
    expect((await invite(session, "Existing Guest", "existing.guest@example.com")).json()).toEqual({ status: "already_invited" });
    const guests = await list(session);
    const shared = guests.find((g) => g.name === "Existing Guest")!;
    const sole = guests.find((g) => g.name === "Removed Later")!;
    expect((await app.inject({ method: "DELETE", url: `/graduate/guests/${shared.id}`, headers: bearer(session) })).json()).toEqual({ outcome: "unlinked" });
    expect((await app.inject({ method: "DELETE", url: `/graduate/guests/${sole.id}`, headers: bearer(session) })).json()).toEqual({ outcome: "revoked" });
    expect((await app.inject({ method: "DELETE", url: "/graduate/sessions/current", headers: bearer(session) })).statusCode).toBe(204);

    expect(await credentials()).toEqual(before);
    const { rows } = await pool!.query("SELECT count(*)::int AS n FROM audit WHERE action IN ('graduate.join_link_rotate', 'invitation.rotate')");
    expect(rows[0].n).toBe(0);

    // And they still open what they opened.
    expect((await app.inject({ method: "GET", url: `/join/${joinCode}` })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/invitations/me", headers: bearer(existingToken) })).statusCode).toBe(200);
    // Removal stops this one by status, not by rotating: the hash above didn't change.
    expect((await app.inject({ method: "GET", url: "/invitations/me", headers: bearer(removedToken) })).statusCode).toBe(404);
  });

  it("issues a join link for a graduate who has none, and keeps it from then on", async (ctx) => {
    if (!admin) return ctx.skip();
    const a = await signedIn();
    await pool!.query("UPDATE users SET join_code = NULL WHERE id = $1", [a.id]);
    const first = (await app.inject({ method: "GET", url: "/graduate/me", headers: bearer(a.session) })).json().joinUrl as string;
    const second = (await app.inject({ method: "GET", url: "/graduate/me", headers: bearer(a.session) })).json().joinUrl as string;
    expect(first).toMatch(/\/join\/[\w-]+$/);
    expect(second).toBe(first);
  });
});
