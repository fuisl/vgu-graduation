import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const ADMIN_TOKEN = "admin.jwt.value";
const WISH_ID = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";
const JOB_ID = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70";
const PUBLIC_ID = "Zx3_k9-photoId";

const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag: (tag: string) => revalidateTag(tag), revalidatePath: vi.fn() }));

const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`);
});
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("../../lib/admin/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/admin/session")>();
  return { ...original, requireAdminSession: async () => ({ token: ADMIN_TOKEN, handle: "octo" }) };
});

const actions = await import("./queue-actions");

function mockFetch(status: number, body: unknown) {
  const spy = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(() => {
  revalidateTag.mockClear();
  redirect.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("moderation actions", () => {
  it("hides a photo with the admin Bearer and revalidates every tag the API names", async () => {
    const spy = mockFetch(200, {
      publicId: PUBLIC_ID,
      status: "hidden",
      isPublic: false,
      revalidateTags: ["gallery", "gallery-public"],
    });

    const result = await actions.moderateMediaAction(PUBLIC_ID, "hidden");

    expect(result).toEqual({ ok: true, data: expect.objectContaining({ status: "hidden" }) });
    const [url, init] = spy.mock.calls[0];
    expect(url).toMatch(new RegExp(`/admin/media/${PUBLIC_ID}/moderate$`));
    expect(url).not.toContain(ADMIN_TOKEN);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${ADMIN_TOKEN}`);
    expect(JSON.parse(init.body)).toEqual({ status: "hidden" });
    expect(revalidateTag.mock.calls.map(([tag]) => tag)).toEqual(["gallery", "gallery-public"]);
  });

  it("restoring a photo (Show) revalidates the gallery listing tag", async () => {
    mockFetch(200, { publicId: PUBLIC_ID, status: "visible", isPublic: false, revalidateTags: ["gallery"] });
    await actions.moderateMediaAction(PUBLIC_ID, "visible");
    expect(revalidateTag).toHaveBeenCalledWith("gallery");
  });

  it("moderates a wish and revalidates the wishes tags", async () => {
    const spy = mockFetch(200, { id: WISH_ID, status: "removed", isPublic: true, revalidateTags: ["wishes", "wishes-public"] });

    const result = await actions.moderateWishAction(WISH_ID, "removed");

    expect(result.ok).toBe(true);
    expect(spy.mock.calls[0][0]).toMatch(new RegExp(`/admin/wishes/${WISH_ID}/moderate$`));
    expect(revalidateTag.mock.calls.map(([tag]) => tag)).toEqual(["wishes", "wishes-public"]);
  });

  it("revalidates nothing when the API reports no change", async () => {
    mockFetch(200, { publicId: PUBLIC_ID, status: "hidden", isPublic: false, revalidateTags: [] });
    expect((await actions.moderateMediaAction(PUBLIC_ID, "hidden")).ok).toBe(true);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("returns the API's message on failure so the UI can roll back, and revalidates nothing", async () => {
    mockFetch(404, { error: "Not Found", message: "Photo not found" });
    expect(await actions.moderateMediaAction(PUBLIC_ID, "removed")).toEqual({ ok: false, message: "Photo not found" });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("reports an unreachable API as a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const result = await actions.moderateWishAction(WISH_ID, "hidden");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/Could not reach the API/);
  });

  it("rejects malformed ids and states without calling the API", async () => {
    const spy = mockFetch(200, {});
    expect((await actions.moderateMediaAction("../secrets", "hidden")).ok).toBe(false);
    expect((await actions.moderateWishAction("not-a-uuid", "hidden")).ok).toBe(false);
    expect((await actions.moderateWishAction(WISH_ID, "deleted" as never)).ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("sends the admin back to sign in when the API rejects the session", async () => {
    mockFetch(401, { error: "Unauthorized", message: "Invalid or expired admin session" });
    await expect(actions.moderateMediaAction(PUBLIC_ID, "hidden")).rejects.toThrow("NEXT_REDIRECT /admin/login");
  });
});

describe("public flag actions", () => {
  it("flags a photo public and revalidates the curated gallery", async () => {
    const spy = mockFetch(200, { publicId: PUBLIC_ID, status: "visible", isPublic: true, revalidateTags: ["gallery-public"] });

    const result = await actions.setMediaPublicAction(PUBLIC_ID, true);

    expect(result).toEqual({ ok: true, data: expect.objectContaining({ isPublic: true }) });
    expect(spy.mock.calls[0][0]).toMatch(new RegExp(`/admin/media/${PUBLIC_ID}/public$`));
    expect(JSON.parse(spy.mock.calls[0][1].body)).toEqual({ isPublic: true });
    expect(revalidateTag.mock.calls.map(([tag]) => tag)).toEqual(["gallery-public"]);
  });

  it("passes the 409 for a hidden wish through as a failure", async () => {
    mockFetch(409, { error: "Conflict", message: "Only visible wishes can be made public (this one is hidden)" });
    expect(await actions.setWishPublicAction(WISH_ID, true)).toEqual({
      ok: false,
      message: "Only visible wishes can be made public (this one is hidden)",
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("only accepts a boolean flag", async () => {
    const spy = mockFetch(200, {});
    expect((await actions.setWishPublicAction(WISH_ID, "true" as never)).ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("listing actions", () => {
  it("loads the next page of a filtered photo view with the cursor", async () => {
    const spy = mockFetch(200, { items: [], nextCursor: null });
    expect((await actions.loadMediaPageAction("hidden", "abc123")).ok).toBe(true);
    const url = new URL(spy.mock.calls[0][0]);
    expect(url.pathname).toBe("/admin/media");
    expect(Object.fromEntries(url.searchParams)).toEqual({ status: "hidden", limit: "24", cursor: "abc123" });
  });

  it("asks for visible and public wishes in the Public view", async () => {
    const spy = mockFetch(200, { items: [], nextCursor: null });
    await actions.loadWishesPageAction("public");
    const url = new URL(spy.mock.calls[0][0]);
    expect(Object.fromEntries(url.searchParams)).toEqual({ status: "visible", isPublic: "true", limit: "30" });
  });

  it("rejects an unknown filter", async () => {
    const spy = mockFetch(200, {});
    expect((await actions.loadMediaPageAction("everything" as never)).ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("print actions", () => {
  const job = {
    id: JOB_ID,
    photoPublicId: PUBLIC_ID,
    copies: 2,
    status: "queued",
    createdAt: "2026-11-21T03:00:00.000Z",
  };

  it("queues 1 to 5 copies of a photo", async () => {
    const spy = mockFetch(201, job);

    const result = await actions.requestPrintAction(PUBLIC_ID, 2);

    expect(result).toEqual({ ok: true, data: job });
    expect(spy.mock.calls[0][0]).toMatch(/\/print\/jobs$/);
    expect(spy.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${ADMIN_TOKEN}`);
    expect(JSON.parse(spy.mock.calls[0][1].body)).toEqual({ photoPublicId: PUBLIC_ID, copies: 2 });
  });

  it("refuses 0 or 6 copies before calling the API", async () => {
    const spy = mockFetch(201, job);
    expect((await actions.requestPrintAction(PUBLIC_ID, 0)).ok).toBe(false);
    expect((await actions.requestPrintAction(PUBLIC_ID, 6)).ok).toBe(false);
    expect((await actions.requestPrintAction(PUBLIC_ID, 1.5)).ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("retries a failed job", async () => {
    const spy = mockFetch(200, {
      ...job,
      status: "queued",
      requestedBy: "admin",
      attempts: 3,
      error: null,
      leaseExpiresAt: null,
      completedAt: null,
      updatedAt: "2026-11-21T03:05:00.000Z",
    });
    expect((await actions.retryPrintJobAction(JOB_ID)).ok).toBe(true);
    expect(spy.mock.calls[0][0]).toMatch(new RegExp(`/admin/print/jobs/${JOB_ID}/retry$`));
  });

  it("polls the queue with an optional status filter", async () => {
    const spy = mockFetch(200, { items: [], nextCursor: null, counts: { queued: 0, printing: 0, done: 0, failed: 0 } });
    await actions.loadPrintJobsAction("failed");
    expect(Object.fromEntries(new URL(spy.mock.calls[0][0]).searchParams)).toEqual({ status: "failed", limit: "30" });
    expect((await actions.loadPrintJobsAction("lost" as never)).ok).toBe(false);
  });
});
