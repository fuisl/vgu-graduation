import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Server Actions for names (#170) and the guide-book (#140). The API client,
 * the session and Next's cache are mocked: these tests pin what each action
 * sends, how it maps API errors to form errors, and that it never logs.
 */

const api = vi.hoisted(() => ({
  updateGraduate: vi.fn(),
  updateInvitation: vi.fn(),
  createGuideItem: vi.fn(),
  updateGuideItem: vi.fn(),
  deleteGuideItem: vi.fn(),
  putInvitationGuide: vi.fn(),
  revokeInvitation: vi.fn(),
  rotateInvitation: vi.fn(),
}));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
const session = vi.hoisted(() => ({
  requireAdminSession: vi.fn(async () => ({ token: "admin.jwt", handle: "fuisl" })),
  redirectIfUnauthorized: vi.fn((result: { status: string; httpStatus?: number }) => {
    if (result.status === "error" && result.httpStatus === 401) throw new Error("NEXT_REDIRECT /admin/login");
  }),
}));

vi.mock("../../lib/api/admin", () => api);
vi.mock("next/cache", () => cache);
vi.mock("../../lib/admin/session", () => session);

const { confirmNameAction, updateGraduateAction, updateInvitationAction } = await import("./name-actions");
const { deleteGuideItemAction, saveGuideItemAction, saveGuidePicksAction, setGuideItemActiveAction } = await import(
  "./guide-actions"
);
const { revokeInvitationAction, rotateInvitationAction } = await import("./actions");
const { getInvitation } = await import("../../lib/api/invitations");
const { resetLastKnownGood } = await import("../../lib/api/last-known-good");

const ID = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";
const ITEM = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e71";
const IDLE = { status: "idle" } as const;

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) for (const item of [value].flat()) data.append(key, item);
  return data;
}

const ok = <T,>(data: T) => ({ status: "ok", data });
const httpError = (httpStatus: number, message = "API error") => ({ status: "error", kind: "http", httpStatus, message });

let logs: ReturnType<typeof vi.spyOn>[] = [];
beforeEach(() => {
  logs = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level));
});
afterEach(() => {
  for (const spy of logs) expect(spy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("updateInvitationAction", () => {
  const initial = {
    id: ID,
    "initial.guestName": "Jane Doe",
    "initial.guestGivenName": "Jane",
    "initial.guestFamilyName": "Doe",
    "initial.guestEmail": "",
    "initial.guestPhone": "",
    "initial.maxPlusOnes": "1",
    "initial.nameReviewed": "true",
    guestName: "Jane Doe",
    guestGivenName: "Jane",
    guestFamilyName: "Doe",
    guestEmail: "",
    guestPhone: "",
    maxPlusOnes: "1",
  };

  it("PATCHes only what changed with the session token and revalidates the admin", async () => {
    api.updateInvitation.mockResolvedValue(ok({ guest: { name: "Jane Doe" } }));

    const state = await updateInvitationAction(IDLE, form({ ...initial, maxPlusOnes: "2" }));

    expect(api.updateInvitation).toHaveBeenCalledWith("admin.jwt", ID, { maxPlusOnes: 2 });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin", "layout");
    expect(state).toEqual({ status: "saved", message: "Saved Jane Doe." });
  });

  it("puts the 409 on the plus-ones field and keeps the typed values", async () => {
    api.updateInvitation.mockResolvedValue(httpError(409, "The guest already confirmed 2 plus-ones"));

    const state = await updateInvitationAction(IDLE, form({ ...initial, maxPlusOnes: "0" }));

    expect(state).toMatchObject({
      status: "error",
      errors: { maxPlusOnes: "The guest already confirmed 2 plus-ones. Ask them to change their RSVP first." },
      values: { maxPlusOnes: "0" },
    });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("does not call the API when nothing changed", async () => {
    const state = await updateInvitationAction(IDLE, form(initial));
    expect(state).toMatchObject({ status: "error", message: "Nothing changed.", errors: {} });
    expect(api.updateInvitation).not.toHaveBeenCalled();
  });

  it("sends the admin back to sign in on a 401", async () => {
    api.updateInvitation.mockResolvedValue(httpError(401));
    await expect(updateInvitationAction(IDLE, form({ ...initial, guestPhone: "+84" }))).rejects.toThrow("NEXT_REDIRECT");
  });
});

describe("updateGraduateAction", () => {
  const initial = {
    id: ID,
    "initial.name": "An Nguyen",
    "initial.givenName": "An",
    "initial.familyName": "Nguyen",
    "initial.email": "an@example.com",
    "initial.nameReviewed": "false",
    name: "An Nguyen",
    givenName: "An",
    familyName: "Nguyen",
    email: "an@example.com",
  };

  it("maps a 409 to the email field", async () => {
    api.updateGraduate.mockResolvedValue(httpError(409));
    const state = await updateGraduateAction(IDLE, form({ ...initial, email: "taken@example.com" }));
    expect(state).toMatchObject({ status: "error", errors: { email: "A graduate with this email already exists" } });
  });

  it("confirms the name when saved unchanged", async () => {
    api.updateGraduate.mockResolvedValue(ok({ name: "An Nguyen" }));
    await updateGraduateAction(IDLE, form(initial));
    expect(api.updateGraduate).toHaveBeenCalledWith("admin.jwt", ID, { nameReviewed: true });
  });
});

describe("confirmNameAction", () => {
  it("sets nameReviewed on the right record", async () => {
    api.updateGraduate.mockResolvedValue(ok({}));
    api.updateInvitation.mockResolvedValue(ok({}));

    expect(await confirmNameAction(IDLE, form({ kind: "graduate", id: ID }))).toEqual({ status: "done", message: "Name confirmed." });
    expect(api.updateGraduate).toHaveBeenCalledWith("admin.jwt", ID, { nameReviewed: true });
    await confirmNameAction(IDLE, form({ kind: "invitation", id: ID }));
    expect(api.updateInvitation).toHaveBeenCalledWith("admin.jwt", ID, { nameReviewed: true });
  });

  it("rejects an unknown kind or id without calling the API", async () => {
    expect(await confirmNameAction(IDLE, form({ kind: "admin", id: ID }))).toMatchObject({ status: "error" });
    expect(await confirmNameAction(IDLE, form({ kind: "graduate", id: "1" }))).toMatchObject({ status: "error" });
    expect(api.updateGraduate).not.toHaveBeenCalled();
  });

  it("shows a network failure in plain words", async () => {
    api.updateInvitation.mockResolvedValue({ status: "error", kind: "network", message: "x" });
    expect(await confirmNameAction(IDLE, form({ kind: "invitation", id: ID }))).toEqual({
      status: "error",
      message: "Could not reach the API. Check the connection and try again.",
    });
  });
});

describe("guide-book actions", () => {
  const fields = { title: "Library", category: "explore", description: "", mapUrl: "", timeHint: "", sortOrder: "10", active: "on" };
  const saved = { title: "Library" };

  it("creates without an id and edits with one", async () => {
    api.createGuideItem.mockResolvedValue(ok(saved));
    api.updateGuideItem.mockResolvedValue(ok(saved));

    expect(await saveGuideItemAction(IDLE, form(fields))).toEqual({ status: "saved", message: "Added “Library”." });
    expect(api.createGuideItem).toHaveBeenCalledWith("admin.jwt", expect.objectContaining({ title: "Library", active: true }));

    expect(await saveGuideItemAction(IDLE, form({ ...fields, id: ITEM }))).toEqual({ status: "saved", message: "Saved “Library”." });
    expect(api.updateGuideItem).toHaveBeenCalledWith("admin.jwt", ITEM, expect.objectContaining({ sortOrder: 10 }));
  });

  it("refuses a malformed id instead of creating a new item", async () => {
    expect(await saveGuideItemAction(IDLE, form({ ...fields, id: "../x" }))).toMatchObject({ status: "error" });
    expect(api.createGuideItem).not.toHaveBeenCalled();
  });

  it("shows and hides with one PATCH", async () => {
    api.updateGuideItem.mockResolvedValue(ok(saved));
    expect(await setGuideItemActiveAction(IDLE, form({ id: ITEM, active: "false" }))).toEqual({
      status: "done",
      message: "Hidden from guests.",
    });
    expect(api.updateGuideItem).toHaveBeenCalledWith("admin.jwt", ITEM, { active: false });
  });

  it("treats a 204 or an already-deleted item as deleted", async () => {
    api.deleteGuideItem.mockResolvedValueOnce({ status: "empty" }).mockResolvedValueOnce(httpError(404));
    expect(await deleteGuideItemAction(IDLE, form({ id: ITEM }))).toEqual({ status: "done", message: "Deleted." });
    expect(await deleteGuideItemAction(IDLE, form({ id: ITEM }))).toEqual({ status: "done", message: "Deleted." });

    api.deleteGuideItem.mockResolvedValueOnce(httpError(500, "Internal error"));
    expect(await deleteGuideItemAction(IDLE, form({ id: ITEM }))).toEqual({ status: "error", message: "Internal error" });
  });

  it("saves picks and says what the guest sees now", async () => {
    api.putInvitationGuide.mockResolvedValueOnce(
      ok({ invitationId: ID, selectedItemIds: [ITEM], effective: { tailored: true, items: [{ id: ITEM }] } })
    );
    expect(await saveGuidePicksAction(IDLE, form({ invitationId: ID, intent: "save", itemIds: ITEM }))).toEqual({
      status: "done",
      message: "Saved. The guest sees 1 picked item.",
    });
    expect(api.putInvitationGuide).toHaveBeenCalledWith("admin.jwt", ID, [ITEM]);

    api.putInvitationGuide.mockResolvedValueOnce(
      ok({ invitationId: ID, selectedItemIds: [], effective: { tailored: false, items: [{ id: ITEM }, { id: ID }] } })
    );
    expect(await saveGuidePicksAction(IDLE, form({ invitationId: ID, intent: "defaults", itemIds: ITEM }))).toEqual({
      status: "done",
      message: "Saved. The guest sees the defaults (2 items).",
    });
    expect(api.putInvitationGuide).toHaveBeenLastCalledWith("admin.jwt", ID, []);
  });

  it("explains a 400 (an item was deleted meanwhile)", async () => {
    api.putInvitationGuide.mockResolvedValue(httpError(400));
    expect(await saveGuidePicksAction(IDLE, form({ invitationId: ID, itemIds: ITEM }))).toMatchObject({
      status: "error",
      message: expect.stringContaining("Reload the page"),
    });
  });
});

describe("invitation revoke and rotate (QA P0-1)", () => {
  const GUEST_TOKEN = "guest-token-value";
  const invitation = {
    id: ID,
    guest: { id: ITEM, name: "Jane Doe", email: null, phone: null },
    maxPlusOnes: 0,
    status: "active",
    validFrom: null,
    validUntil: null,
    inviters: [],
    rsvp: null,
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    resetLastKnownGood();
  });

  /** The guest page saw the invitation once; the API then goes down. */
  async function rememberedThenApiDown() {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => invitation })
        .mockRejectedValue(new TypeError("fetch failed")),
    );
    expect((await getInvitation(GUEST_TOKEN)).status).toBe("ok");
    expect((await getInvitation(GUEST_TOKEN)).status).toBe("ok");
  }

  it("revoking drops the outage copy, so the old link stops working even while the API is down", async () => {
    await rememberedThenApiDown();
    api.revokeInvitation.mockResolvedValue(ok({ invitationId: ID, status: "revoked" }));

    expect(await revokeInvitationAction(IDLE, form({ invitationId: ID }))).toEqual({ status: "revoked" });
    expect(await getInvitation(GUEST_TOKEN)).toMatchObject({ status: "error", kind: "network" });
  });

  it("rotating drops it too", async () => {
    await rememberedThenApiDown();
    api.rotateInvitation.mockResolvedValue(ok({ invitationId: ID, token: "new", inviteUrl: "https://x.test/invite/new" }));

    expect(await rotateInvitationAction(IDLE, form({ invitationId: ID }))).toMatchObject({ status: "rotated" });
    expect(await getInvitation(GUEST_TOKEN)).toMatchObject({ status: "error", kind: "network" });
  });

  it("keeps it when the API refused the revoke", async () => {
    await rememberedThenApiDown();
    api.revokeInvitation.mockResolvedValue(httpError(500));

    expect(await revokeInvitationAction(IDLE, form({ invitationId: ID }))).toMatchObject({ status: "error" });
    expect((await getInvitation(GUEST_TOKEN)).status).toBe("ok");
  });
});
