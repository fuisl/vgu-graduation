import { describe, expect, it } from "vitest";
import { inviteLocation, parseInviteAnswer } from "./answer";

describe("parseInviteAnswer", () => {
  it("accepts the form's two values", () => {
    expect(parseInviteAnswer("yes")).toBe("yes");
    expect(parseInviteAnswer("no")).toBe("no");
  });

  it("ignores everything else", () => {
    for (const value of ["maybe", "YES", "", " yes", ["yes"], ["yes", "no"], undefined, null, true]) {
      expect(parseInviteAnswer(value)).toBeNull();
    }
  });
});

describe("inviteLocation", () => {
  it("carries an answer and stays plain without one", () => {
    expect(inviteLocation("no")).toBe("/invite?answer=no");
    expect(inviteLocation(null)).toBe("/invite");
  });
});
