import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, hashToken } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("hashToken", () => {
  it("never returns the raw token", async () => {
    const digest = await hashToken("super-secret-bearer-token");
    expect(digest).not.toContain("super-secret-bearer-token");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", async () => {
    const a = await hashToken("same-input");
    const b = await hashToken("same-input");
    expect(a).toBe(b);
  });
});

describe("apiFetch", () => {
  it("passes next.revalidate and tags through for a revalidate cache mode", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchSpy);

    await apiFetch("/event", { cache: { mode: "revalidate", seconds: 300, tags: ["event"] } });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/event"),
      expect.objectContaining({ next: { revalidate: 300, tags: ["event"] } })
    );
  });

  it("sets cache: no-store for admin (uncached) requests", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchSpy);

    await apiFetch("/admin/overview", { cache: { mode: "no-store" } });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/admin/overview"),
      expect.objectContaining({ cache: "no-store" })
    );
  });
});
