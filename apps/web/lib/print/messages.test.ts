import { describe, expect, it } from "vitest";
import { parseRetryAfter } from "../api/print";
import { formatRetryAfter, printErrorMessage } from "./messages";

describe("print messages", () => {
  it("formats Retry-After for people", () => {
    expect(formatRetryAfter(30)).toBe("a minute");
    expect(formatRetryAfter(60 * 45)).toBe("about 45 minutes");
    expect(formatRetryAfter(3600)).toBe("about an hour");
    expect(formatRetryAfter(3 * 3600)).toBe("about 3 hours");
  });

  it("names the limit and the wait on 429", () => {
    expect(printErrorMessage(429, 1200, 3)).toBe("You've reached the limit of 3 prints an hour. Try again in about 20 minutes.");
  });

  it("has a message for each failure the API documents", () => {
    expect(printErrorMessage(403, undefined, 3)).toMatch(/isn't available/);
    expect(printErrorMessage(409, undefined, 3)).toMatch(/can't be printed/);
    for (const status of [401, 404, 410]) expect(printErrorMessage(status, undefined, 3)).toMatch(/invitation link/);
    expect(printErrorMessage(503, undefined, 3)).toMatch(/connection/);
  });

  it("parses Retry-After as seconds or an HTTP date", () => {
    expect(parseRetryAfter("120")).toBe(120);
    expect(parseRetryAfter(new Date(10_000 + 90_000).toUTCString(), 10_000)).toBe(90);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
  });
});
