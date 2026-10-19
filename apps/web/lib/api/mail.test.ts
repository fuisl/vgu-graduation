import { afterEach, describe, expect, it, vi } from "vitest";
import { isMailEnabled, sendCalendarEmail } from "./mail";

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}), ...response });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("isMailEnabled", () => {
  it("reads GET /mail/status and treats every failure as off", async () => {
    mockFetch({ json: async () => ({ enabled: true }) });
    expect(await isMailEnabled()).toBe(true);
    mockFetch({ json: async () => ({ enabled: "yes" }) });
    expect(await isMailEnabled()).toBe(false);
    mockFetch({ ok: false, status: 500 });
    expect(await isMailEnabled()).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await isMailEnabled()).toBe(false);
  });
});

describe("sendCalendarEmail", () => {
  it("posts the address and locale with the bearer token, never cached", async () => {
    const fn = mockFetch({ json: async () => ({ status: "sent" }) });
    expect(await sendCalendarEmail("tok", "guest@example.com", "vi")).toBe("sent");
    const [url, init] = fn.mock.calls[0]!;
    expect(url).toMatch(/\/calendar\/email$/);
    expect(init).toMatchObject({ method: "POST", cache: "no-store", body: JSON.stringify({ email: "guest@example.com", locale: "vi" }) });
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it.each([
    [400, "invalid"],
    [401, "no_invitation"],
    [404, "no_invitation"],
    [410, "no_invitation"],
    [429, "limited"],
    [503, "unavailable"],
    [502, "failed"],
  ] as const)("maps %i to %s", async (status, outcome) => {
    mockFetch({ ok: false, status });
    expect(await sendCalendarEmail("tok", "guest@example.com", "en")).toBe(outcome);
  });
});
