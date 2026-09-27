import { describe, expect, it } from "vitest";
import { isAllowedAdmin } from "./allowlist";

describe("isAllowedAdmin", () => {
  it("allows a collaborator's handle", () => {
    expect(isAllowedAdmin("fuisl")).toBe(true);
  });

  it("is case-insensitive (GitHub handles are)", () => {
    expect(isAllowedAdmin("FuIsL")).toBe(true);
  });

  it("rejects a handle not on the list", () => {
    expect(isAllowedAdmin("some-random-github-user")).toBe(false);
  });
});
