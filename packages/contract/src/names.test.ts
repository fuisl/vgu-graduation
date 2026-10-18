import { describe, expect, it } from "vitest";
import { foldVietnamese, isVietnameseFamilyName, splitPersonName } from "./names.js";

describe("splitPersonName", () => {
  it.each([
    // Vietnamese order: family first, called by the last word
    ["Nguyễn Văn An", "An", "Nguyễn"],
    ["Nguyen Van An", "An", "Nguyen"],
    ["NGUYỄN THỊ MINH ANH", "ANH", "NGUYỄN"],
    ["Trần Thị Bích Ngọc", "Ngọc", "Trần"],
    ["Đặng Hữu Phúc", "Phúc", "Đặng"],
    ["Dang Huu Phuc", "Phuc", "Dang"],
    ["Lê Mai", "Mai", "Lê"],
    ["Nguyễn Hà", "Hà", "Nguyễn"],
    // Western order
    ["John Smith", "John", "Smith"],
    ["Mary Jane Watson", "Mary", "Watson"],
    ["Ann Nguyen", "Ann", "Nguyen"],
    ["Minh Nguyen", "Minh", "Nguyen"],
    // A Vietnamese name in Western order whose given name is also a family name
    ["Mai Tran", "Mai", "Tran"],
    ["Hà Nguyễn", "Hà", "Nguyễn"],
  ])("%s → given %s, family %s", (name, given, family) => {
    expect(splitPersonName(name)).toEqual({ givenName: given, familyName: family });
  });

  it("treats a single word as the given name", () => {
    expect(splitPersonName("Madonna")).toEqual({ givenName: "Madonna", familyName: null });
  });

  it("collapses whitespace and normalises decomposed diacritics", () => {
    const decomposed = "  Nguyễn   Văn  An ";
    expect(splitPersonName(decomposed)).toEqual({ givenName: "An", familyName: "Nguyễn" });
  });
});

describe("isVietnameseFamilyName", () => {
  it("matches with and without diacritics, in any case", () => {
    for (const word of ["Nguyễn", "nguyen", "NGUYEN", "Đỗ", "do", "Võ", "vo"]) {
      expect(isVietnameseFamilyName(word)).toBe(true);
    }
  });

  it("does not match common Western given names", () => {
    for (const word of ["John", "Ann", "Mary", "Minh"]) expect(isVietnameseFamilyName(word)).toBe(false);
  });
});

describe("foldVietnamese", () => {
  it("strips tone marks and đ", () => {
    expect(foldVietnamese("Đặng Hữu Phúc")).toBe("dang huu phuc");
  });
});
