import { describe, expect, it } from "vitest";
import { errorResult, ok } from "../api/result";
import { createI18n } from "../i18n/dictionary";
import { mapRsvpResult, parseRsvpForm } from "./rsvp-form";

const en = createI18n("en");

const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });

describe("parseRsvpForm", () => {
  it("requires an attending choice", () => {
    expect(parseRsvpForm(form({}), 1, en)).toMatchObject({ ok: false, state: { kind: "invalid" } });
  });
  it("parses an attending guest", () => {
    expect(
      parseRsvpForm(form({ attending: "yes", plusOnesCount: "1", dietaryRequirements: " vegan ", notes: "" }), 2, en)
    ).toEqual({
      ok: true,
      request: { attending: true, plusOnesCount: 1, dietaryRequirements: "vegan", notes: null },
    });
  });
  it("ignores plus-ones and dietary when not attending", () => {
    expect(parseRsvpForm(form({ attending: "no", plusOnesCount: "2", dietaryRequirements: "x" }), 2, en)).toEqual({
      ok: true,
      request: { attending: false, plusOnesCount: 0, dietaryRequirements: null, notes: null },
    });
  });
  it("rejects plus-ones above the maximum or non-integers", () => {
    expect(parseRsvpForm(form({ attending: "yes", plusOnesCount: "3" }), 2, en).ok).toBe(false);
    expect(parseRsvpForm(form({ attending: "yes", plusOnesCount: "1.5" }), 2, en).ok).toBe(false);
  });
  it("forces zero plus-ones when the invitation allows none", () => {
    expect(parseRsvpForm(form({ attending: "yes", plusOnesCount: "5" }), 0, en)).toMatchObject({
      ok: true,
      request: { plusOnesCount: 0 },
    });
  });
  it("rejects over-long text", () => {
    expect(parseRsvpForm(form({ attending: "yes", notes: "a".repeat(1001) }), 0, en).ok).toBe(false);
  });

  it("omits accessibility when the section was not changed, so stored needs are kept (#176)", () => {
    const parsed = parseRsvpForm(form({ attending: "yes", "a11y-wheelchair": "on", accessibilityNote: "x" }), 0, en);
    expect(parsed.ok && "accessibility" in parsed.request).toBe(false);
  });

  it("sends every need once the section was changed", () => {
    const parsed = parseRsvpForm(
      form({
        attending: "yes",
        accessibilityTouched: "1",
        "a11y-wheelchair": "on",
        "a11y-aisleSeat": "on",
        accessibilityNote: "  Arriving by taxi ",
      }),
      0,
      en
    );
    expect(parsed).toMatchObject({
      ok: true,
      request: {
        accessibility: {
          wheelchair: true,
          stepFreeAccess: false,
          captions: false,
          seatNearSpeakers: false,
          largePrint: false,
          visionAssistance: false,
          seatNearFront: false,
          aisleSeat: true,
          companion: false,
          note: "Arriving by taxi",
        },
      },
    });
  });

  it("sends all-false needs when a guest clears the section (the API stores that as none)", () => {
    const parsed = parseRsvpForm(form({ attending: "no", accessibilityTouched: "1", accessibilityNote: "  " }), 0, en);
    expect(parsed.ok && parsed.request.accessibility).toEqual({
      wheelchair: false,
      stepFreeAccess: false,
      captions: false,
      seatNearSpeakers: false,
      largePrint: false,
      visionAssistance: false,
      seatNearFront: false,
      aisleSeat: false,
      companion: false,
      note: null,
    });
  });

  it("rejects an accessibility note over 500 characters", () => {
    const parsed = parseRsvpForm(form({ attending: "yes", accessibilityTouched: "1", accessibilityNote: "a".repeat(501) }), 0, en);
    expect(parsed).toMatchObject({ ok: false, state: { kind: "invalid" } });
  });
});

describe("mapRsvpResult", () => {
  const rsvp = { id: "x", attending: true, plusOnesCount: 0, dietaryRequirements: null, notes: null, updatedAt: "" };
  it("maps success", () => expect(mapRsvpResult(ok(rsvp), en).status).toBe("success"));
  it("shows a plain line on 400, never the API's own text (QA P2-5)", () =>
    expect(mapRsvpResult(errorResult("http", "The API rejected the request", 400), en)).toEqual({
      status: "error",
      kind: "rejected",
      message: "Some answers could not be accepted. Please check them and try again.",
    }));
  it.each([404, 410, 401])("treats %i as invitation gone", (s) =>
    expect(mapRsvpResult(errorResult("http", "x", s), en)).toMatchObject({ kind: "gone" })
  );
  it("says expired on 410", () =>
    expect(mapRsvpResult(errorResult("http", "x", 410), en)).toMatchObject({
      message: expect.stringContaining("expired"),
    }));
  it.each([errorResult("network", "x"), errorResult("http", "x", 500), errorResult("validation", "x")])(
    "offers retry on transient failures",
    (r) => expect(mapRsvpResult(r, en)).toMatchObject({ kind: "retry" })
  );
  it("answers in Vietnamese, with a general line instead of the API's English detail (#9)", () => {
    const vi = createI18n("vi");
    expect(mapRsvpResult(ok(rsvp), vi)).toEqual({ status: "success", message: "Cảm ơn Quý khách, phản hồi đã được lưu: Quý khách sẽ tham dự." });
    expect(mapRsvpResult(errorResult("http", "Too many plus-ones", 400), vi)).toMatchObject({
      kind: "rejected",
      message: expect.not.stringContaining("plus-ones"),
    });
    expect(parseRsvpForm(form({}), 1, vi)).toMatchObject({ ok: false, state: { message: "Vui lòng cho biết Quý khách có tham dự hay không." } });
  });
});
