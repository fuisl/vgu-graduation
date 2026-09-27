import { afterEach, describe, expect, it, vi } from "vitest";
import { getInvitation } from "./invitations";

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

  it("returns empty on 404 (invalid/expired/revoked invitation)", async () => {
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
});
