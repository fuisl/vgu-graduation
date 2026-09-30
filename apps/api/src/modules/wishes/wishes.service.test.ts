import { describe, expect, it, vi } from "vitest";
import type { ResolveResult } from "../invitations/invitations.service.js";
import type { StoredWish } from "./wishes.repository.js";
import { decodeCursor, encodeCursor, InvalidCursorError, WISH_RATE_LIMIT, WishesService } from "./wishes.service.js";

const INVITATION_ID = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";
const NOW = new Date("2026-11-15T03:00:00.000Z");

const okInvitation: ResolveResult = {
  status: "ok",
  invitation: {
    id: INVITATION_ID,
    guest: { id: INVITATION_ID, name: "Jane Guest", email: null, phone: null },
    maxPlusOnes: 0,
    status: "active",
    validFrom: null,
    validUntil: null,
    inviters: [],
    rsvp: null,
  },
};

function wish(n: number, moderationStatus: StoredWish["moderationStatus"] = "visible"): StoredWish {
  return {
    id: `3f2e8b1a-9c3d-4c9a-8b1e-00000000000${n}`,
    authorName: "Jane Guest",
    body: `wish ${n}`,
    moderationStatus,
    createdAt: new Date(NOW.getTime() - n * 1000),
  };
}

function setup(resolved: ResolveResult = okInvitation, recent = 0, rows: StoredWish[] = []) {
  const repo = {
    create: vi.fn(async (_inv: string, authorName: string, body: string) => ({ ...wish(1), authorName, body })),
    countSince: vi.fn(async () => recent),
    list: vi.fn(async () => rows),
    moderate: vi.fn(),
  };
  const service = new WishesService({ resolveByToken: async () => resolved }, repo, () => NOW);
  return { service, repo };
}

describe("WishesService.createByToken", () => {
  it("defaults the author to the guest's name and serializes the date", async () => {
    const { service, repo } = setup();
    const result = await service.createByToken("t", { body: "Congrats!" });
    expect(repo.create).toHaveBeenCalledWith(INVITATION_ID, "Jane Guest", "Congrats!");
    expect(result).toMatchObject({ status: "ok", wish: { authorName: "Jane Guest", body: "Congrats!" } });
    if (result.status === "ok") expect(result.wish.createdAt).toBe(wish(1).createdAt.toISOString());
  });

  it("uses the given author name", async () => {
    const { service, repo } = setup();
    await service.createByToken("t", { body: "Hi", authorName: "Grandma" });
    expect(repo.create).toHaveBeenCalledWith(INVITATION_ID, "Grandma", "Hi");
  });

  it("counts the invitation's wishes over the rate window", async () => {
    const { service, repo } = setup();
    await service.createByToken("t", { body: "Hi" });
    expect(repo.countSince).toHaveBeenCalledWith(INVITATION_ID, new Date(NOW.getTime() - WISH_RATE_LIMIT.windowMs));
  });

  it("refuses once the invitation hits the cap, without writing", async () => {
    const { service, repo } = setup(okInvitation, WISH_RATE_LIMIT.max);
    const result = await service.createByToken("t", { body: "Hi" });
    expect(result).toEqual({ status: "rate_limited", retryAfterSeconds: WISH_RATE_LIMIT.windowMs / 1000 });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it.each(["invalid", "expired"] as const)("passes through %s without writing", async (status) => {
    const { service, repo } = setup({ status });
    expect(await service.createByToken("t", { body: "Hi" })).toEqual({ status });
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe("listing", () => {
  it("returns a next cursor only when another page exists", async () => {
    const { service, repo } = setup(okInvitation, 0, [wish(1), wish(2), wish(3)]);
    const page = await service.listVisible({ limit: 2 });
    expect(page.items.map((w) => w.body)).toEqual(["wish 1", "wish 2"]);
    expect(page.nextCursor).toBe(encodeCursor(wish(2).id));
    expect(repo.list).toHaveBeenCalledWith({ limit: 2, afterId: undefined, visibleOnly: true });

    const last = await service.listVisible({ limit: 5, cursor: page.nextCursor! });
    expect(last.nextCursor).toBeNull();
    expect(repo.list).toHaveBeenLastCalledWith({ limit: 5, afterId: wish(2).id, visibleOnly: true });
  });

  it("admin listing includes every state", async () => {
    const { service, repo } = setup(okInvitation, 0, [wish(1, "hidden")]);
    const page = await service.listAll({ limit: 10 });
    expect(page.items[0]).toMatchObject({ status: "hidden" });
    expect(repo.list).toHaveBeenCalledWith({ limit: 10, afterId: undefined, visibleOnly: false });
  });

  it("rejects cursors it did not issue", () => {
    expect(() => decodeCursor("not-a-cursor")).toThrow(InvalidCursorError);
    expect(() => decodeCursor(Buffer.from("1; DROP TABLE wishes").toString("base64url"))).toThrow(InvalidCursorError);
    expect(decodeCursor(encodeCursor(wish(1).id))).toBe(wish(1).id);
  });
});
