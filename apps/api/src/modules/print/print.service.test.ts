import { PRINT_GUEST_RATE_LIMIT, PRINT_LEASE_SECONDS, PRINT_MAX_ATTEMPTS } from "@grad/contract";
import { describe, expect, it, vi } from "vitest";
import type { ResolveResult } from "../invitations/invitations.service.js";
import type { StoredPrintJob } from "./print.repository.js";
import { InvalidPrintCursorError, PrintService } from "./print.service.js";

const INVITATION_ID = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";
const JOB_ID = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70";
const NOW = new Date("2026-11-20T03:00:00.000Z");

const stored: StoredPrintJob = {
  id: JOB_ID,
  photoPublicId: "pub/1",
  copies: 1,
  status: "queued",
  requestedByAdmin: null,
  attempts: 0,
  error: null,
  leaseExpiresAt: null,
  completedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const okInvitation: ResolveResult = {
  status: "ok",
  invitation: {
    id: INVITATION_ID,
    guest: { id: INVITATION_ID, name: "Jane", email: null, phone: null },
    maxPlusOnes: 0,
    status: "active",
    validFrom: null,
    validUntil: null,
    inviters: [],
    rsvp: null,
  },
};

function setup({
  guestRequestsEnabled = true,
  photo = { id: "photo-row", printable: true } as { id: string; printable: boolean } | null,
  resolved = okInvitation,
} = {}) {
  const repo = {
    create: vi.fn(async () => ({ status: "ok" as const, job: stored })),
    claim: vi.fn(async () => ({ ...stored, status: "printing" as const, attempts: 1, leaseExpiresAt: new Date(NOW.getTime() + 300_000) })),
    complete: vi.fn(),
    retry: vi.fn(),
    list: vi.fn(async () => [stored, { ...stored, id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e71", requestedByAdmin: "tester" }]),
    counts: vi.fn(async () => ({ queued: 2, printing: 0, done: 0, failed: 0 })),
    expireLeases: vi.fn(async () => {}),
  };
  const service = new PrintService(
    repo,
    { findForPrint: async () => photo },
    { resolveByToken: async () => resolved },
    { apiOrigin: "https://api.example.test", print: { guestRequestsEnabled } },
    () => NOW,
  );
  return { service, repo };
}

describe("PrintService.create", () => {
  it("queues an admin request with the handle as requester and actor", async () => {
    const { service, repo } = setup({ guestRequestsEnabled: false });
    const result = await service.create({ kind: "admin", handle: "tester" }, { photoPublicId: "pub/1", copies: 3 });
    expect(result).toMatchObject({ status: "ok", job: { id: JOB_ID, createdAt: NOW.toISOString() } });
    expect(repo.create).toHaveBeenCalledWith({ photoId: "photo-row", copies: 3, requestedByAdmin: "tester" }, "tester");
  });

  it("refuses guests while guest requests are disabled (the default), before resolving anything", async () => {
    const { service, repo } = setup({ guestRequestsEnabled: false });
    expect(await service.create({ kind: "guest", token: "t" }, { photoPublicId: "pub/1", copies: 1 })).toEqual({ status: "guest_disabled" });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("queues a guest request with the invitation's rate limit window", async () => {
    const { service, repo } = setup();
    expect((await service.create({ kind: "guest", token: "t" }, { photoPublicId: "pub/1", copies: 1 })).status).toBe("ok");
    expect(repo.create).toHaveBeenCalledWith({ photoId: "photo-row", copies: 1, requestedByInvitationId: INVITATION_ID }, "guest", {
      max: PRINT_GUEST_RATE_LIMIT.max,
      since: new Date(NOW.getTime() - PRINT_GUEST_RATE_LIMIT.windowSeconds * 1000),
    });
  });

  it("limits guests to one copy and passes invitation errors through", async () => {
    expect(await setup().service.create({ kind: "guest", token: "t" }, { photoPublicId: "p", copies: 2 })).toEqual({ status: "too_many_copies" });
    expect(await setup({ resolved: { status: "expired" } }).service.create({ kind: "guest", token: "t" }, { photoPublicId: "p", copies: 1 })).toEqual({
      status: "expired",
    });
  });

  it("only prints visible, processed photos", async () => {
    expect(await setup({ photo: null }).service.create({ kind: "admin", handle: "a" }, { photoPublicId: "p", copies: 1 })).toEqual({
      status: "photo_not_found",
    });
    expect(
      await setup({ photo: { id: "x", printable: false } }).service.create({ kind: "admin", handle: "a" }, { photoPublicId: "p", copies: 1 }),
    ).toEqual({ status: "photo_not_printable" });
  });

  it("maps the repository's rate limit to a Retry-After", async () => {
    const { service, repo } = setup();
    repo.create.mockResolvedValueOnce({ status: "rate_limited" } as never);
    expect(await service.create({ kind: "guest", token: "t" }, { photoPublicId: "p", copies: 1 })).toEqual({
      status: "rate_limited",
      retryAfterSeconds: PRINT_GUEST_RATE_LIMIT.windowSeconds,
    });
  });
});

describe("PrintService.claimNext", () => {
  it("claims with the contract's lease and hands out the display derivative URL", async () => {
    const { service, repo } = setup();
    const job = await service.claimNext();
    expect(repo.claim).toHaveBeenCalledWith(PRINT_LEASE_SECONDS, PRINT_MAX_ATTEMPTS, "service:printer");
    expect(job).toMatchObject({
      status: "printing",
      imageUrl: "https://api.example.test/media/pub%2F1/display",
      variant: "display",
      attempt: 1,
      leaseExpiresAt: "2026-11-20T03:05:00.000Z",
    });
  });

  it("returns null on an empty queue", async () => {
    const { service, repo } = setup();
    repo.claim.mockResolvedValueOnce(null as never);
    expect(await service.claimNext()).toBeNull();
  });
});

describe("PrintService.list", () => {
  it("settles expired leases, pages and reports who asked", async () => {
    const { service, repo } = setup();
    const page = await service.list({ limit: 1 });
    expect(repo.expireLeases).toHaveBeenCalledWith(PRINT_MAX_ATTEMPTS);
    expect(page.items).toEqual([expect.objectContaining({ id: JOB_ID, requestedBy: "guest" })]);
    expect(page.nextCursor).toBe(JOB_ID);
    expect(page.counts.queued).toBe(2);
  });

  it("rejects a cursor that isn't a job id", async () => {
    await expect(setup().service.list({ limit: 10, cursor: "nope" })).rejects.toBeInstanceOf(InvalidPrintCursorError);
  });
});
