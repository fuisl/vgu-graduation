import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGraduate,
  createInvitation,
  getEventUncached,
  listGraduates,
  listInvitations,
  listRsvps,
  revokeInvitation,
  rotateInvitation,
  updateEvent,
} from "./admin";

const ADMIN_TOKEN = "admin.jwt.value";
const ID = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";
const GRAD_ID = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70";

const graduate = { id: GRAD_ID, name: "An Nguyen", email: "an@example.com", createdAt: "2026-09-29T10:00:00.000Z" };
const guest = { id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e71", name: "Jane Doe", email: null, phone: null };
const event = {
  name: "VGU Graduation 2026",
  startsAt: "2026-11-21T02:00:00.000Z",
  endsAt: null,
  timeZone: "Asia/Ho_Chi_Minh",
  timeConfirmed: true,
  venue: { name: "VGU Campus", address: "Binh Duong", mapUrl: "https://maps.example.com/vgu" },
  contact: null,
  arrivalInfo: null,
};

function mockFetch(response: { ok?: boolean; status?: number; json?: () => Promise<unknown> }) {
  const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}), ...response });
  vi.stubGlobal("fetch", spy);
  return spy;
}

function lastInit(spy: ReturnType<typeof vi.fn>): RequestInit & { headers: Record<string, string> } {
  return spy.mock.calls[0][1];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin BFF: auth and caching", () => {
  it("forwards the admin session as a Bearer header, never caches, and keeps the token out of the URL", async () => {
    const spy = mockFetch({ json: async () => ({ items: [graduate] }) });

    await listGraduates(ADMIN_TOKEN);

    const [url, init] = spy.mock.calls[0];
    expect(url).toMatch(/\/admin\/graduates$/);
    expect(url).not.toContain(ADMIN_TOKEN);
    expect(init.headers).toEqual({ Authorization: `Bearer ${ADMIN_TOKEN}` });
    expect(init.cache).toBe("no-store");
    expect(init.next).toBeUndefined();
  });

  it("surfaces 401 as an http error carrying the status so pages can send the admin to sign in", async () => {
    mockFetch({ ok: false, status: 401, json: async () => ({ error: "Unauthorized", message: "Invalid or expired admin session" }) });

    const result = await listInvitations(ADMIN_TOKEN);

    expect(result).toMatchObject({ status: "error", kind: "http", httpStatus: 401 });
  });

  it("does not echo the token in any error message", async () => {
    mockFetch({ ok: false, status: 500, json: async () => { throw new Error("not json"); } });

    const result = await listRsvps(ADMIN_TOKEN);

    expect(JSON.stringify(result)).not.toContain(ADMIN_TOKEN);
    expect(result).toMatchObject({ status: "error", kind: "http", httpStatus: 500, message: "The API returned an unexpected error" });
  });

  it("returns a network error when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    expect(await listGraduates(ADMIN_TOKEN)).toMatchObject({ status: "error", kind: "network" });
  });

  it("returns a validation error when the response does not match the contract", async () => {
    mockFetch({ json: async () => ({ items: [{ id: "not-a-uuid" }] }) });

    expect(await listInvitations(ADMIN_TOKEN)).toMatchObject({ status: "error", kind: "validation" });
  });
});

describe("admin BFF: writes", () => {
  it("POSTs a graduate as JSON and parses the 201", async () => {
    const spy = mockFetch({ status: 201, json: async () => graduate });

    const result = await createGraduate(ADMIN_TOKEN, { name: "An Nguyen", email: "an@example.com" });

    expect(result).toEqual({ status: "ok", data: graduate });
    const init = lastInit(spy);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({ name: "An Nguyen", email: "an@example.com" });
  });

  it("passes the API's 409 message through for a duplicate graduate", async () => {
    mockFetch({ ok: false, status: 409, json: async () => ({ error: "Conflict", message: "A graduate with this email already exists" }) });

    const result = await createGraduate(ADMIN_TOKEN, { name: "An", email: "an@example.com" });

    expect(result).toEqual({
      status: "error",
      kind: "http",
      httpStatus: 409,
      message: "A graduate with this email already exists",
    });
  });

  it("returns the one-time invite link from POST /admin/invitations", async () => {
    const created = {
      invitationId: ID,
      token: "raw-invite-token",
      inviteUrl: "https://grad.example.com/invite/raw-invite-token",
      guest,
      maxPlusOnes: 1,
      inviterUserIds: [GRAD_ID],
    };
    const spy = mockFetch({ status: 201, json: async () => created });

    const result = await createInvitation(ADMIN_TOKEN, { guestName: "Jane Doe", inviterUserIds: [GRAD_ID], maxPlusOnes: 1 });

    expect(result.status === "ok" && result.data.inviteUrl).toBe(created.inviteUrl);
    expect(spy.mock.calls[0][0]).toMatch(/\/admin\/invitations$/);
  });

  it("rotates and revokes by id", async () => {
    let spy = mockFetch({ json: async () => ({ token: "t2", inviteUrl: "https://grad.example.com/invite/t2" }) });
    expect((await rotateInvitation(ADMIN_TOKEN, ID)).status).toBe("ok");
    expect(spy.mock.calls[0][0]).toMatch(new RegExp(`/admin/invitations/${ID}/rotate$`));
    expect(lastInit(spy).method).toBe("POST");

    spy = mockFetch({ json: async () => ({ id: ID, status: "revoked", revokedAt: "2026-09-30T08:00:00.000Z" }) });
    expect((await revokeInvitation(ADMIN_TOKEN, ID)).status).toBe("ok");
    expect(spy.mock.calls[0][0]).toMatch(new RegExp(`/admin/invitations/${ID}/revoke$`));
  });

  it("surfaces 404 on rotate (inactive invitation) as an error with the API's message", async () => {
    mockFetch({ ok: false, status: 404, json: async () => ({ error: "Not Found", message: "Invitation not found or inactive" }) });

    expect(await rotateInvitation(ADMIN_TOKEN, ID)).toMatchObject({
      status: "error",
      httpStatus: 404,
      message: "Invitation not found or inactive",
    });
  });

  it("PUTs the event and returns the saved document", async () => {
    const spy = mockFetch({ json: async () => event });

    const result = await updateEvent(ADMIN_TOKEN, event);

    expect(result).toEqual({ status: "ok", data: event });
    expect(lastInit(spy).method).toBe("PUT");
    expect(spy.mock.calls[0][0]).toMatch(/\/admin\/event$/);
  });
});

describe("getEventUncached", () => {
  it("reads the public event without the admin token and without caching", async () => {
    const spy = mockFetch({ json: async () => event });

    expect(await getEventUncached()).toEqual({ status: "ok", data: event });
    const init = lastInit(spy);
    expect(init.headers).toEqual({});
    expect(init.cache).toBe("no-store");
  });

  it("returns empty when the event is not configured (404)", async () => {
    mockFetch({ ok: false, status: 404 });

    expect(await getEventUncached()).toEqual({ status: "empty" });
  });
});
