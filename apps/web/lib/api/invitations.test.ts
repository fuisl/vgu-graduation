import { afterEach, describe, expect, it, vi } from "vitest";
import { selectInvitePageState } from "../invite/state";
import { forgetInvitation, getInvitation } from "./invitations";
import { LAST_KNOWN_GOOD_TTL_MS, resetLastKnownGood } from "./last-known-good";

const validInvitation = {
  id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
  guest: {
    id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70",
    name: "Jane Doe",
    email: null,
    phone: null,
  },
  maxPlusOnes: 1,
  status: "active",
  validFrom: null,
  validUntil: null,
  inviters: [],
  rsvp: null,
};

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      ...response,
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  resetLastKnownGood();
});

describe("getInvitation", () => {
  it("returns ok with parsed data on a valid 200", async () => {
    mockFetch({ ok: true, status: 200, json: async () => validInvitation });

    const result = await getInvitation("some-token");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.id).toBe(validInvitation.id);
    }
  });

  it("surfaces 410 (expired invitation) as an http error carrying the status, so pages can say it expired", async () => {
    mockFetch({ ok: false, status: 410 });

    const result = await getInvitation("expired-token");

    expect(result).toMatchObject({ status: "error", kind: "http", httpStatus: 410 });
  });

  it("returns empty on 404 (invalid/revoked invitation)", async () => {
    mockFetch({ ok: false, status: 404 });

    const result = await getInvitation("bad-token");

    expect(result.status).toBe("empty");
  });

  it("returns empty on 401 (missing token)", async () => {
    mockFetch({ ok: false, status: 401 });

    const result = await getInvitation("");

    expect(result.status).toBe("empty");
  });

  it("returns an http error on a 500", async () => {
    mockFetch({ ok: false, status: 500 });

    const result = await getInvitation("some-token");

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.kind).toBe("http");
      expect(result.httpStatus).toBe(500);
    }
  });

  it("returns a validation error when the body doesn't match the contract", async () => {
    mockFetch({ ok: true, status: 200, json: async () => ({ nonsense: true }) });

    const result = await getInvitation("some-token");

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.kind).toBe("validation");
    }
  });

  it("returns a network error when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed"))
    );

    const result = await getInvitation("some-token");

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.kind).toBe("network");
    }
  });

  it("never uses the Next fetch cache (QA P0-1)", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => validInvitation });
    vi.stubGlobal("fetch", fn);

    await getInvitation("some-token");

    const [, init] = fn.mock.calls[0]!;
    expect(init.cache).toBe("no-store");
    expect(init.next).toBeUndefined();
  });

  it("treats 403 as a refusal, like 401 and 404", async () => {
    mockFetch({ ok: false, status: 403 });
    expect(await getInvitation("some-token")).toEqual({ status: "empty" });
  });
});

/** Answers each fetch in turn: a status, or "down" for a network error. */
function sequence(...answers: (number | "down")[]) {
  const fn = vi.fn();
  for (const answer of answers) {
    if (answer === "down") fn.mockRejectedValueOnce(new TypeError("fetch failed"));
    else fn.mockResolvedValueOnce({ ok: answer < 300, status: answer, json: async () => validInvitation });
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("getInvitation after a good answer (last known good, QA P0-1)", () => {
  it.each([401, 403, 404])("renders invalid once the API answers %i, and stays invalid while the API is down", async (status) => {
    sequence(200, status, "down");

    expect(selectInvitePageState(await getInvitation("tok")).kind).toBe("personal");
    expect(selectInvitePageState(await getInvitation("tok")).kind).toBe("invalid");
    expect(selectInvitePageState(await getInvitation("tok")).kind).toBe("error");
  });

  it("renders expired once the API answers 410, never the remembered copy", async () => {
    sequence(200, 410, 503);

    expect(selectInvitePageState(await getInvitation("tok")).kind).toBe("personal");
    expect(selectInvitePageState(await getInvitation("tok")).kind).toBe("expired");
    expect(selectInvitePageState(await getInvitation("tok")).kind).toBe("error");
  });

  it.each(["down", 500, 502, 503] as const)("keeps the personal page when the API is %s", async (outage) => {
    sequence(200, outage);

    await getInvitation("tok");
    const result = await getInvitation("tok");

    expect(result).toEqual({ status: "ok", data: validInvitation });
  });

  it("never serves one token's copy for another token", async () => {
    sequence(200, "down");

    await getInvitation("tok");

    expect(selectInvitePageState(await getInvitation("other")).kind).toBe("error");
  });

  it("does not remember a non-active invitation", async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ...validInvitation, status: "revoked" }) })
      .mockRejectedValueOnce(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fn);

    expect(selectInvitePageState(await getInvitation("tok")).kind).toBe("invalid");
    expect(selectInvitePageState(await getInvitation("tok")).kind).toBe("error");
  });

  it("answers expired from the copy once its validUntil has passed", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-15T23:00:00.000Z"), toFake: ["Date"] });
    const fn = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ...validInvitation, validUntil: "2026-11-16T00:00:00.000Z" }) })
      .mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fn);

    await getInvitation("tok");
    expect(selectInvitePageState(await getInvitation("tok")).kind).toBe("personal");
    vi.setSystemTime(new Date("2026-11-16T00:00:01.000Z"));
    expect(selectInvitePageState(await getInvitation("tok")).kind).toBe("expired");
  });

  it("forgets the copy after an admin revoke or rotate (forgetInvitation)", async () => {
    sequence(200, "down");

    await getInvitation("tok");
    forgetInvitation(validInvitation.id);

    expect(selectInvitePageState(await getInvitation("tok")).kind).toBe("error");
  });

  it("forgets the copy after the time to live", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-15T00:00:00.000Z"), toFake: ["Date"] });
    sequence(200, "down");

    await getInvitation("tok");
    vi.setSystemTime(Date.now() + LAST_KNOWN_GOOD_TTL_MS + 1);

    expect(selectInvitePageState(await getInvitation("tok")).kind).toBe("error");
  });
});
