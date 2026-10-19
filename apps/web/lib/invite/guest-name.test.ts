import { describe, expect, it } from "vitest";
import { guestGivenName } from "./guest-name";

describe("guestGivenName", () => {
  it("uses givenName from the API", () => {
    expect(guestGivenName({ name: "John Smith", givenName: "John" })).toBe("John");
    expect(guestGivenName({ name: "Nguyễn Văn An", givenName: "An" })).toBe("An");
    expect(guestGivenName({ name: "Linh Tran", givenName: " Linh " })).toBe("Linh");
  });

  it.each([
    ["Nguyễn Văn An", "An"],
    ["John Smith", "John"],
    ["Mai Tran", "Mai"],
    ["Madonna", "Madonna"],
  ])("falls back to the shared name rules for %j without givenName", (name, expected) => {
    expect(guestGivenName({ name })).toBe(expected);
  });
});
