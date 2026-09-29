import { afterEach, describe, expect, it, vi } from "vitest";
import { getEvent } from "./event";

const validEvent = {
  name: "VGU Graduation 2026",
  startsAt: "2026-11-21T09:00:00+07:00",
  endsAt: null,
  timeZone: "Asia/Ho_Chi_Minh",
  timeConfirmed: false,
  venue: { name: "VGU Campus", address: "Binh Duong", mapUrl: "https://maps.example.com/vgu" },
  contact: null,
  arrivalInfo: null,
};

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}), ...response });
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getEvent", () => {
  it("returns ok with parsed data and caches for 300s under the event tag", async () => {
    const spy = mockFetch({ json: async () => validEvent });

    const result = await getEvent();

    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.data.venue.name).toBe("VGU Campus");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("/event"),
      expect.objectContaining({ next: { revalidate: 300, tags: ["event"] } })
    );
  });

  it("returns an http error carrying the status on a 500", async () => {
    mockFetch({ ok: false, status: 500 });
    expect(await getEvent()).toMatchObject({ status: "error", kind: "http", httpStatus: 500 });
  });

  it("returns a validation error when the body doesn't match the contract", async () => {
    mockFetch({ json: async () => ({ nonsense: true }) });
    expect(await getEvent()).toMatchObject({ status: "error", kind: "validation" });
  });

  it("returns a validation error when the body is not JSON", async () => {
    mockFetch({
      json: async () => {
        throw new SyntaxError("bad json");
      },
    });
    expect(await getEvent()).toMatchObject({ status: "error", kind: "validation" });
  });

  it("returns a network error when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await getEvent()).toMatchObject({ status: "error", kind: "network" });
  });
});
