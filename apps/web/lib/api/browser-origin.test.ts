import { describe, expect, it } from "vitest";
import { browserApiOrigin, mediaDerivativeUrl } from "./browser-origin";

describe("browserApiOrigin", () => {
  it("normalizes an HTTP(S) origin and rejects non-web protocols", () => {
    expect(browserApiOrigin("https://api.example.test/path")).toBe("https://api.example.test");
    expect(browserApiOrigin("javascript:alert(1)")).not.toContain("javascript:");
  });

  it("encodes public ids in derivative URLs", () => {
    expect(mediaDerivativeUrl("photo/id", "display", "https://api.example.test"))
      .toBe("https://api.example.test/media/photo%2Fid/display");
  });
});
