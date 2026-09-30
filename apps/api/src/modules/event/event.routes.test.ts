import { eventSchema } from "@grad/contract";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../config.js";
import { buildServer } from "../../server.js";
import { approvedTester } from "../admin/admin-accounts.fake.js";
import { buildIcs, escapeText, foldLine } from "./event.ics.js";
import type { EventStore, StoredEvent } from "./event.repository.js";

const config = loadConfig({ LOG_LEVEL: "silent", PUBLIC_ORIGIN: "https://grad26.fuisloy.dev" });
const secret = new TextEncoder().encode("dev-only-change-me");

const base: StoredEvent = {
  name: "Graduation Ceremony 2026",
  startsAt: new Date("2026-12-12T02:00:00.000Z"),
  endsAt: null,
  timeZone: "Asia/Ho_Chi_Minh",
  timeConfirmed: false,
  venueName: "VGU Main Hall",
  venueAddress: "Binh Duong, Vietnam",
  venueMapUrl: "https://maps.example.com/vgu",
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  arrivalInfo: null,
  sequence: 0,
  updatedAt: new Date("2026-09-29T00:00:00.000Z"),
};

function fakeStore(initial: StoredEvent | null = base) {
  let row = initial;
  const updates: { actor: string }[] = [];
  const store: EventStore = {
    get: async () => row,
    update: async (input, actor) => {
      if (!row) return null;
      updates.push({ actor });
      row = {
        ...row,
        name: input.name,
        startsAt: new Date(input.startsAt),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        timeZone: input.timeZone,
        timeConfirmed: input.timeConfirmed,
        venueName: input.venue.name,
        venueAddress: input.venue.address,
        venueMapUrl: input.venue.mapUrl,
        contactName: input.contact?.name ?? null,
        contactEmail: input.contact?.email ?? null,
        contactPhone: input.contact?.phone ?? null,
        arrivalInfo: input.arrivalInfo,
        sequence: row.sequence + 1,
        updatedAt: new Date("2026-10-01T00:00:00.000Z"),
      };
      return row;
    },
  };
  return { store, updates };
}

async function adminToken() {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("fuisl")
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
    .sign(secret);
}

const validBody = {
  name: "Graduation Ceremony 2026",
  startsAt: "2026-12-12T09:00:00+07:00",
  endsAt: "2026-12-12T12:00:00+07:00",
  timeZone: "Asia/Ho_Chi_Minh",
  timeConfirmed: true,
  venue: { name: "VGU Main Hall", address: "Binh Duong, Vietnam", mapUrl: "https://maps.example.com/vgu" },
  contact: { name: "Office", email: "office@example.com", phone: null },
  arrivalInfo: "Park at gate 2, arrive by 8:30.",
};

describe("GET /event", () => {
  it("maps the row to the public contract and is CDN-cacheable", async () => {
    const app = buildServer({ adminAccounts: approvedTester(), config, eventStore: fakeStore().store });
    const res = await app.inject({ method: "GET", url: "/event" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, s-maxage=300, stale-while-revalidate=60");
    const body = eventSchema.parse(res.json());
    expect(body).toEqual({
      name: "Graduation Ceremony 2026",
      startsAt: "2026-12-12T02:00:00.000Z",
      endsAt: null,
      timeZone: "Asia/Ho_Chi_Minh",
      timeConfirmed: false,
      venue: { name: "VGU Main Hall", address: "Binh Duong, Vietnam", mapUrl: "https://maps.example.com/vgu" },
      contact: null,
      arrivalInfo: null,
    });
  });

  it("maps contact details when present", async () => {
    const { store } = fakeStore({ ...base, contactName: "Office", contactEmail: "o@example.com", contactPhone: null });
    const res = await buildServer({ adminAccounts: approvedTester(), config, eventStore: store }).inject({ method: "GET", url: "/event" });
    expect(res.json().contact).toEqual({ name: "Office", email: "o@example.com", phone: null });
  });

  it("returns 404 when the event row is missing", async () => {
    const res = await buildServer({ adminAccounts: approvedTester(), config, eventStore: fakeStore(null).store }).inject({ method: "GET", url: "/event" });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /event/calendar.ics", () => {
  it("serves a public, cacheable text/calendar feed with CRLF endings", async () => {
    const res = await buildServer({ adminAccounts: approvedTester(), config, eventStore: fakeStore().store }).inject({
      method: "GET",
      url: "/event/calendar.ics",
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("text/calendar; charset=utf-8");
    expect(res.headers["cache-control"]).toBe("public, s-maxage=300, stale-while-revalidate=60");
    expect(res.body.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(res.body.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(res.body.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("keeps the UID stable and bumps SEQUENCE across admin edits", async () => {
    const { store } = fakeStore();
    const app = buildServer({ adminAccounts: approvedTester(), config, eventStore: store });
    const feed = async () => (await app.inject({ method: "GET", url: "/event/calendar.ics" })).body;

    const before = await feed();
    const put = await app.inject({
      method: "PUT",
      url: "/admin/event",
      headers: { authorization: `Bearer ${await adminToken()}` },
      payload: validBody,
    });
    expect(put.statusCode).toBe(200);
    const after = await feed();

    expect(before).toContain("UID:event-1@grad26.fuisloy.dev\r\n");
    expect(after).toContain("UID:event-1@grad26.fuisloy.dev\r\n");
    expect(before).toContain("SEQUENCE:0\r\n");
    expect(after).toContain("SEQUENCE:1\r\n");
    expect(after).toContain("LAST-MODIFIED:20261001T000000Z\r\n");
    expect(after).toContain("STATUS:CONFIRMED\r\n");
    expect(after).toContain("DTSTART:20261212T020000Z\r\n");
    expect(after).toContain("DTEND:20261212T050000Z\r\n");
  });
});

describe("buildIcs", () => {
  const opts = { uidDomain: "grad26.fuisloy.dev", siteUrl: "https://grad26.fuisloy.dev" };

  it("marks an unconfirmed time as TENTATIVE with a default two-hour end", () => {
    const ics = buildIcs(base, opts);
    expect(ics).toContain("STATUS:TENTATIVE\r\n");
    expect(ics).toContain("DTSTART:20261212T020000Z\r\n");
    expect(ics).toContain("DTEND:20261212T040000Z\r\n");
    expect(ics.replace(/\r\n /g, "")).toContain("Date and time to be confirmed");
    for (const key of ["PRODID:", "VERSION:2.0", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:", "REFRESH-INTERVAL", "X-PUBLISHED-TTL", "URL:https://grad26.fuisloy.dev"]) {
      expect(ics).toContain(key);
    }
  });

  it("contains no contact or personal data", () => {
    const ics = buildIcs({ ...base, contactName: "Jane Doe", contactEmail: "jane@example.com", contactPhone: "+84 123" }, opts);
    expect(ics).not.toMatch(/Jane|jane@|\+84/);
  });

  it("escapes text values", () => {
    expect(escapeText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
    const ics = buildIcs({ ...base, venueName: "Hall; East, Wing", arrivalInfo: "Line1\nLine2" }, opts);
    expect(ics.replace(/\r\n /g, "")).toContain("LOCATION:Hall\\; East\\, Wing\\, Binh Duong\\, Vietnam");
    expect(ics.replace(/\r\n /g, "")).toContain("Line1\\nLine2");
  });

  it("folds long lines at 75 octets without splitting characters, and unfolds losslessly", () => {
    const long = "DESCRIPTION:" + "Lễ tốt nghiệp ".repeat(30);
    const folded = foldLine(long);
    const physical = folded.split("\r\n");
    expect(physical.length).toBeGreaterThan(1);
    for (const line of physical) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    for (const line of physical.slice(1)) expect(line.startsWith(" ")).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(long);
    expect(folded).not.toContain("�");
  });
});

describe("PUT /admin/event", () => {
  it("requires an admin session", async () => {
    const { store, updates } = fakeStore();
    const app = buildServer({ adminAccounts: approvedTester(), config, eventStore: store });
    const res = await app.inject({ method: "PUT", url: "/admin/event", payload: validBody });
    expect(res.statusCode).toBe(401);
    expect(updates).toHaveLength(0);
  });

  it("replaces the event, attributes it to the admin and is not cacheable", async () => {
    const { store, updates } = fakeStore();
    const res = await buildServer({ adminAccounts: approvedTester(), config, eventStore: store }).inject({
      method: "PUT",
      url: "/admin/event",
      headers: { authorization: `Bearer ${await adminToken()}` },
      payload: validBody,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.json().timeConfirmed).toBe(true);
    expect(updates).toEqual([{ actor: "fuisl" }]);
  });

  it("rejects endsAt not after startsAt", async () => {
    const { store, updates } = fakeStore();
    const res = await buildServer({ adminAccounts: approvedTester(), config, eventStore: store }).inject({
      method: "PUT",
      url: "/admin/event",
      headers: { authorization: `Bearer ${await adminToken()}` },
      payload: { ...validBody, endsAt: "2026-12-12T08:00:00+07:00" },
    });
    expect(res.statusCode).toBe(400);
    expect(updates).toHaveLength(0);
  });
});
