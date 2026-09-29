import { describe, expect, it } from "vitest";
import { errorResult, ok } from "../api/result";
import { mapRsvpResult, parseRsvpForm } from "./rsvp-form";

const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });

describe("parseRsvpForm", () => {
  it("requires an attending choice", () => {
    expect(parseRsvpForm(form({}), 1)).toMatchObject({ ok: false, state: { kind: "invalid" } });
  });
  it("parses an attending guest", () => {
    expect(
      parseRsvpForm(form({ attending: "yes", plusOnesCount: "1", dietaryRequirements: " vegan ", notes: "" }), 2)
    ).toEqual({
      ok: true,
      request: { attending: true, plusOnesCount: 1, dietaryRequirements: "vegan", notes: null },
    });
  });
  it("ignores plus-ones and dietary when not attending", () => {
    expect(parseRsvpForm(form({ attending: "no", plusOnesCount: "2", dietaryRequirements: "x" }), 2)).toEqual({
      ok: true,
      request: { attending: false, plusOnesCount: 0, dietaryRequirements: null, notes: null },
    });
  });
  it("rejects plus-ones above the maximum or non-integers", () => {
    expect(parseRsvpForm(form({ attending: "yes", plusOnesCount: "3" }), 2).ok).toBe(false);
    expect(parseRsvpForm(form({ attending: "yes", plusOnesCount: "1.5" }), 2).ok).toBe(false);
  });
  it("forces zero plus-ones when the invitation allows none", () => {
    expect(parseRsvpForm(form({ attending: "yes", plusOnesCount: "5" }), 0)).toMatchObject({
      ok: true,
      request: { plusOnesCount: 0 },
    });
  });
  it("rejects over-long text", () => {
    expect(parseRsvpForm(form({ attending: "yes", notes: "a".repeat(1001) }), 0).ok).toBe(false);
  });
});

describe("mapRsvpResult", () => {
  const rsvp = { id: "x", attending: true, plusOnesCount: 0, dietaryRequirements: null, notes: null, updatedAt: "" };
  it("maps success", () => expect(mapRsvpResult(ok(rsvp)).status).toBe("success"));
  it("shows the API message on 400", () =>
    expect(mapRsvpResult(errorResult("http", "Too many plus-ones", 400))).toEqual({
      status: "error",
      kind: "rejected",
      message: "Too many plus-ones",
    }));
  it.each([404, 410, 401])("treats %i as invitation gone", (s) =>
    expect(mapRsvpResult(errorResult("http", "x", s))).toMatchObject({ kind: "gone" })
  );
  it("says expired on 410", () =>
    expect(mapRsvpResult(errorResult("http", "x", 410))).toMatchObject({
      message: expect.stringContaining("expired"),
    }));
  it.each([errorResult("network", "x"), errorResult("http", "x", 500), errorResult("validation", "x")])(
    "offers retry on transient failures",
    (r) => expect(mapRsvpResult(r)).toMatchObject({ kind: "retry" })
  );
});
