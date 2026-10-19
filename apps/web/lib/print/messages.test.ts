import { describe, expect, it } from "vitest";
import { parseRetryAfter } from "../api/print";
import { pickMessages } from "../i18n/dictionary";
import { sliceTranslator } from "../i18n/format";
import { formatRetryAfter, printErrorMessage } from "./messages";

const t = sliceTranslator(pickMessages("en", "print."));

describe("print messages", () => {
  it("formats Retry-After for people", () => {
    expect(formatRetryAfter(30, t)).toBe("a minute");
    expect(formatRetryAfter(60 * 45, t)).toBe("about 45 minutes");
    expect(formatRetryAfter(3600, t)).toBe("about an hour");
    expect(formatRetryAfter(3 * 3600, t)).toBe("about 3 hours");
  });

  it("names the limit and the wait on 429", () => {
    expect(printErrorMessage(429, 1200, 3, t)).toBe("You've reached the limit of 3 prints an hour. Try again in about 20 minutes.");
  });

  it("names the limit and the wait in Vietnamese (#9)", () => {
    const vi = sliceTranslator(pickMessages("vi", "print."));
    expect(printErrorMessage(429, 1200, 3, vi)).toBe("Quý khách đã đạt giới hạn 3 bản in mỗi giờ. Vui lòng thử lại sau khoảng 20 phút.");
  });

  it("has a message for each failure the API documents", () => {
    expect(printErrorMessage(403, undefined, 3, t)).toMatch(/isn't available/);
    expect(printErrorMessage(409, undefined, 3, t)).toMatch(/can't be printed/);
    for (const status of [401, 404, 410]) expect(printErrorMessage(status, undefined, 3, t)).toMatch(/invitation link/);
    expect(printErrorMessage(503, undefined, 3, t)).toMatch(/connection/);
  });

  it("parses Retry-After as seconds or an HTTP date", () => {
    expect(parseRetryAfter("120")).toBe(120);
    expect(parseRetryAfter(new Date(10_000 + 90_000).toUTCString(), 10_000)).toBe(90);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
  });
});
