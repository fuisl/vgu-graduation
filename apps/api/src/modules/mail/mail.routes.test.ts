import { describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import { buildServer } from "../../server.js";
import { approvedTester } from "../admin/admin-accounts.fake.js";
import type { InvitationsService, ResolveResult } from "../invitations/invitations.service.js";
import { MailService } from "./mail.service.js";
import { fakeMailer } from "./mailer.fake.js";
import { SlidingWindowLimiter } from "./rate-limit.js";

const config = loadConfig({ LOG_LEVEL: "silent" });
const TOKEN = "guest-token-value";
const INVITATION_ID = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";
const ADDRESS = "someone.private@example.com";

const ok: ResolveResult = {
  status: "ok",
  invitation: {
    id: INVITATION_ID,
    guest: { id: INVITATION_ID, name: "An", email: null, phone: null },
    maxPlusOnes: 0,
    status: "active",
    validFrom: null,
    validUntil: null,
    inviters: [],
    rsvp: null,
  },
};

const event = {
  name: "VGU Graduation Ceremony 2026",
  nameVi: null,
  startsAt: new Date("2026-11-21T02:00:00Z"),
  endsAt: null,
  timeZone: "Asia/Ho_Chi_Minh",
  timeConfirmed: false,
  venueName: "Ceremony Hall",
  venueAddress: "Ring Road 4",
  venueAddressVi: null,
  venueMapUrl: "https://maps.example.com/vgu",
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  arrivalInfo: null,
  arrivalInfoVi: null,
  sequence: 0,
  updatedAt: new Date("2026-10-01T00:00:00Z"),
};

function setup(options: { enabled?: boolean; resolve?: (token: string) => ResolveResult; limit?: number; logLevel?: "trace" } = {}) {
  const fake = fakeMailer();
  const lines: string[] = [];
  const service = new MailService(options.enabled === false ? null : fake.mailer, { get: async () => event }, config);
  const resolve = options.resolve ?? ((token: string) => (token === TOKEN ? ok : { status: "invalid" as const }));
  const app = buildServer({
    adminAccounts: approvedTester(),
    config: { ...config, logLevel: options.logLevel ?? "silent" },
    logStream: { write: (line) => void lines.push(line) },
    invitationsService: { resolveByToken: async (token: string) => resolve(token) } as unknown as InvitationsService,
    mail: { service, limiter: new SlidingWindowLimiter(options.limit ?? 5, 60_000) },
  });
  return { app, ...fake, lines };
}

const send = (app: ReturnType<typeof setup>["app"], headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` }) =>
  app.inject({ method: "POST", url: "/calendar/email", headers, payload: { email: ADDRESS, locale: "en" } });

describe("GET /mail/status", () => {
  it("says whether mail is on, publicly cacheable", async () => {
    const on = await setup().app.inject({ method: "GET", url: "/mail/status" });
    expect(on.json()).toEqual({ enabled: true });
    expect(on.headers["cache-control"]).toContain("public");
    const off = await setup({ enabled: false }).app.inject({ method: "GET", url: "/mail/status" });
    expect(off.json()).toEqual({ enabled: false });
  });
});

describe("POST /calendar/email", () => {
  it("sends the calendar invite to the typed address for a valid invitation", async () => {
    const { app, sent } = setup();
    const res = await send(app);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "sent" });
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: ADDRESS, subject: "Calendar: VGU Graduation Ceremony 2026" });
  });

  it("needs a valid invitation credential, from the header or the cookie", async () => {
    const { app, sent } = setup({ resolve: (t) => (t === TOKEN ? ok : t === "old" ? { status: "expired" } : { status: "invalid" }) });
    expect((await send(app, {})).statusCode).toBe(401);
    expect((await send(app, { authorization: "Bearer wrong" })).statusCode).toBe(404);
    expect((await send(app, { authorization: "Bearer old" })).statusCode).toBe(410);
    expect((await send(app, { cookie: `inv=${TOKEN}` })).statusCode).toBe(200);
    expect(sent).toHaveLength(1);
  });

  it("rejects something that is not an email address", async () => {
    const { app } = setup();
    const res = await app.inject({
      method: "POST",
      url: "/calendar/email",
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { email: "not-an-address\r\nBcc: x@example.com" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("is 503 while mail is off", async () => {
    const res = await send(setup({ enabled: false }).app);
    expect(res.statusCode).toBe(503);
  });

  it("limits sends per invitation and gives a failed send back", async () => {
    const { app, fail } = setup({ limit: 2 });
    fail();
    expect((await send(app)).statusCode).toBe(502);
    fail(false);
    expect((await send(app)).statusCode).toBe(200);
    expect((await send(app)).statusCode).toBe(200);
    const limited = await send(app);
    expect(limited.statusCode).toBe(429);
  });

  it("never logs the address or the token", async () => {
    const { app, lines } = setup({ logLevel: "trace" });
    await send(app);
    await app.close();
    const output = lines.join("");
    expect(output).toContain("calendar invite email");
    expect(output).not.toContain(ADDRESS);
    expect(output).not.toContain(TOKEN);
  });
});
