import {describe, expect, it} from "vitest";
import {isLight} from "./ThemeColorSync";

describe("isLight", () => {
  it("treats white and the soft blue as light backdrops", () => {
    expect(isLight("rgb(255, 255, 255)")).toBe(true);
    expect(isLight("rgb(232, 238, 251)")).toBe(true);
  });

  it("treats the brand blues as dark backdrops", () => {
    expect(isLight("rgb(31, 75, 176)")).toBe(false);
    expect(isLight("rgba(20, 50, 120, 0.9)")).toBe(false);
  });

  it("falls back to dark for unparseable colours", () => {
    expect(isLight("currentcolor")).toBe(false);
  });
});
