import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAuthorizeUrl, resolveGithubHandle } from "./github";

beforeEach(() => {
  process.env.GITHUB_CLIENT_ID = "test-client-id";
  process.env.GITHUB_CLIENT_SECRET = "test-client-secret";
  process.env.PUBLIC_ORIGIN = "https://grad26.fuisloy.dev";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildAuthorizeUrl", () => {
  it("includes the client id, callback redirect and state", () => {
    const url = buildAuthorizeUrl("some-state");
    expect(url).toContain("client_id=test-client-id");
    expect(url).toContain(encodeURIComponent("https://grad26.fuisloy.dev/admin/auth/callback"));
    expect(url).toContain("state=some-state");
  });
});

describe("resolveGithubHandle", () => {
  it("returns the handle on a successful exchange", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "gho_abc123" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ login: "fuisl" }) });
    vi.stubGlobal("fetch", fetchMock);

    const handle = await resolveGithubHandle("some-code");
    expect(handle).toBe("fuisl");
  });

  it("returns null when the code exchange fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const handle = await resolveGithubHandle("bad-code");
    expect(handle).toBeNull();
  });

  it("returns null when the user lookup fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "gho_abc123" }) })
      .mockResolvedValueOnce({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    const handle = await resolveGithubHandle("some-code");
    expect(handle).toBeNull();
  });
});
