import { describe, expect, it } from "vitest";
import { containsBlockedWord, containsLink, isAllowed } from "./word-filter.js";

describe("containsBlockedWord", () => {
  it("blocks English profanity and slurs as whole words, any case", () => {
    for (const text of ["What the FUCK", "this is shit.", "you bitch!", "Motherfucker", "a slur: nigger"]) {
      expect(containsBlockedWord(text), text).toBe(true);
    }
  });

  it("does not match inside other words (the Scunthorpe problem)", () => {
    for (const text of [
      "Greetings from Scunthorpe",
      "Congratulations, class of 2026!",
      "Shitake mushrooms for the party",
      "Assessment passed, as hoped",
      "Cocktails at Dickens Bar after the ceremony",
      "We are so proud of you, Dick",
    ]) {
      expect(containsBlockedWord(text), text).toBe(false);
    }
  });

  it("blocks Vietnamese profanity with diacritics, in either Unicode form", () => {
    for (const text of ["Địt mẹ", "đồ đĩ", "Đéo quan tâm", "lồn", "Đụ má mày"]) {
      expect(containsBlockedWord(text), text).toBe(true);
      expect(containsBlockedWord(text.normalize("NFD")), `${text} (NFD)`).toBe(true);
    }
  });

  it("blocks toneless Vietnamese only where the phrase is unambiguous", () => {
    for (const text of ["dit me may", "DCM", "vcl that", "đcm"]) {
      expect(containsBlockedWord(text), text).toBe(true);
    }
  });

  it("lets ordinary Vietnamese through, even words that fold to a blocked one", () => {
    for (const text of [
      "Chúc mừng tốt nghiệp! Đi chơi vui nhé",
      "Dù mẹ không đến được, cả nhà luôn tự hào về con",
      "Mừng con lớn, mẹ thương con",
      "Các con giỏi lắm, cặp đôi đẹp quá",
      "Mua một lon nước nhé",
      "di chuc mung tot nghiep", // toneless greeting: "di" must not read as "đĩ"
      "Chúc mừng Đức và Duy",
    ]) {
      expect(containsBlockedWord(text), text).toBe(false);
    }
  });
});

describe("containsLink", () => {
  it("finds links with a scheme and www addresses", () => {
    expect(containsLink("buy now https://spam.example")).toBe(true);
    expect(containsLink("HTTP://x.y")).toBe(true);
    expect(containsLink("visit www.spam.example")).toBe(true);
  });

  it("ignores ordinary punctuation, times and emails", () => {
    expect(containsLink("See you at 09:00, ok?")).toBe(false);
    expect(containsLink("Ratio 3:1 and a smile :)")).toBe(false);
    expect(containsLink("mail me at an@example.com")).toBe(false);
  });
});

describe("isAllowed", () => {
  it("checks every text and blocks links only when asked", () => {
    expect(isAllowed(["Congrats!", "Aunt Mai"], { blockLinks: true })).toBe(true);
    expect(isAllowed(["Congrats!", "shit"], { blockLinks: false })).toBe(false);
    expect(isAllowed(["see https://photos.example"], { blockLinks: false })).toBe(true);
    expect(isAllowed(["see https://photos.example"], { blockLinks: true })).toBe(false);
    expect(isAllowed(["Hi", undefined], { blockLinks: true })).toBe(true);
  });
});
