import { afterEach, describe, expect, it, vi as vitest } from "vitest";
import { localeFromAcceptLanguage, resolveLocale } from "./config";
import { createI18n, lookupMessage, pickMessages } from "./dictionary";
import { localizeEvent } from "./event";
import { formatMessage, sliceTranslator } from "./format";
import { en, type Messages } from "./messages/en";
import { vi } from "./messages/vi";
import { safeReturnPath } from "./return-path";

describe("dictionaries (#9)", () => {
  it("en and vi have exactly the same keys", () => {
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort());
  });

  it("keep every placeholder of the English message", () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const id of Object.keys(en) as (keyof Messages)[]) {
      expect(placeholders(vi[id]), id).toEqual(placeholders(en[id]));
    }
  });

  it("have no empty messages, and plurals come in .one/.other pairs", () => {
    for (const [id, text] of [...Object.entries(en), ...Object.entries(vi)]) {
      expect(text.trim(), id).not.toBe("");
      if (id.endsWith(".one")) expect(en).toHaveProperty(`${id.slice(0, -4)}.other`);
    }
  });
});

describe("locale resolution: cookie, then Accept-Language, then English", () => {
  it("prefers a valid cookie over the browser", () => {
    expect(resolveLocale({ cookie: "vi", acceptLanguage: "en-US,en;q=0.9" })).toBe("vi");
    expect(resolveLocale({ cookie: "en", acceptLanguage: "vi-VN,vi;q=0.9" })).toBe("en");
  });

  it("ignores an unknown cookie and reads Accept-Language", () => {
    expect(resolveLocale({ cookie: "de", acceptLanguage: "vi-VN,vi;q=0.9,en;q=0.8" })).toBe("vi");
    expect(resolveLocale({ cookie: "", acceptLanguage: "vi" })).toBe("vi");
  });

  it("falls back to English", () => {
    expect(resolveLocale({})).toBe("en");
    expect(resolveLocale({ acceptLanguage: "de-DE,fr;q=0.8" })).toBe("en");
    expect(resolveLocale({ acceptLanguage: ";;;,q=x" })).toBe("en");
  });

  it("reads Accept-Language by quality, any vi* tag as Vietnamese", () => {
    expect(localeFromAcceptLanguage("de-DE,vi;q=0.8,en;q=0.5")).toBe("vi");
    expect(localeFromAcceptLanguage("de-DE,en;q=0.9,vi;q=0.5")).toBe("en");
    expect(localeFromAcceptLanguage("en;q=0.2, vi-VN;q=0.7")).toBe("vi");
    expect(localeFromAcceptLanguage("vi;q=0")).toBeNull();
    expect(localeFromAcceptLanguage(null)).toBeNull();
  });
});

describe("fallback for untranslated strings", () => {
  afterEach(() => vitest.restoreAllMocks());

  it("uses English and warns once in development when a translation is missing", () => {
    const warn = vitest.spyOn(console, "warn").mockImplementation(() => {});
    const partialVi: Partial<Messages> = { ...vi };
    delete partialVi["nav.home"];
    const dictionaries = { en, vi: partialVi };
    expect(lookupMessage("vi", "nav.home", dictionaries)).toBe("Home");
    expect(lookupMessage("vi", "nav.home", dictionaries)).toBe("Home");
    expect(lookupMessage("vi", "nav.venue", dictionaries)).toBe("Địa điểm");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(createI18n("vi", dictionaries).t("nav.home")).toBe("Home");
  });

  it("a client slice renders the key (never blank, never a throw) for a message it was not given", () => {
    const warn = vitest.spyOn(console, "warn").mockImplementation(() => {});
    const t = sliceTranslator({} as Record<"nav.home", string>);
    expect(t("nav.home")).toBe("nav.home");
    expect(warn).toHaveBeenCalled();
  });

  it("leaves an unknown placeholder visible", () => {
    expect(formatMessage("Hi {name}, {missing}", { name: "An" })).toBe("Hi An, {missing}");
  });
});

describe("translators", () => {
  it("fills placeholders and picks plural forms", () => {
    const { t } = createI18n("en");
    expect(t("invite.greeting", { name: "An" })).toBe("You are invited, An");
    expect(t.plural("invite.plusOnes", 1)).toBe("You may bring up to 1 guest.");
    expect(t.plural("invite.plusOnes", 3)).toBe("You may bring up to 3 guests.");
    expect(createI18n("vi").t.plural("invite.plusOnes", 3)).toBe("Quý khách có thể đi cùng tối đa 3 người.");
  });

  it("formats dates with en-GB and vi-VN", () => {
    expect(createI18n("en").intl).toBe("en-GB");
    expect(createI18n("vi").intl).toBe("vi-VN");
  });

  it("slices only the requested prefixes", () => {
    const slice = pickMessages("vi", "nav.");
    expect(Object.keys(slice).sort()).toEqual(["nav.camera", "nav.home", "nav.venue", "nav.wishes"]);
    expect(slice["nav.home"]).toBe("Trang chủ");
  });
});

describe("safeReturnPath", () => {
  it("keeps a same-site path", () => {
    expect(safeReturnPath("/venue")).toBe("/venue");
    expect(safeReturnPath("/memories/timeline")).toBe("/memories/timeline");
  });

  it("never echoes a query, a fragment or an invitation token", () => {
    expect(safeReturnPath("/gallery?x=1#top")).toBe("/gallery");
    expect(safeReturnPath("/invite/secret-token-123")).toBe("/invite");
    expect(safeReturnPath("/invite")).toBe("/invite");
  });

  it("refuses anything that is not a local path", () => {
    for (const raw of ["https://evil.test/", "//evil.test", "/\\evil.test", "evil", "", null, 42, "/api/locale", `/${"a".repeat(600)}`]) {
      expect(safeReturnPath(raw)).toBe("/");
    }
  });
});

describe("localizeEvent", () => {
  const event = {
    name: "GRAD '26 Graduation Ceremony",
    nameVi: "Lễ tốt nghiệp GRAD '26",
    startsAt: "2026-11-20T02:00:00.000Z",
    endsAt: null,
    timeZone: "Asia/Ho_Chi_Minh",
    timeConfirmed: false,
    venue: { name: "Ceremony Hall", address: "Vietnamese-German University", addressVi: null, mapUrl: "https://maps.example/x" },
    contact: null,
    arrivalInfo: "Park at gate B.",
    arrivalInfoVi: "  ",
  };

  it("uses the Vietnamese fields when set, English otherwise", () => {
    const vi = localizeEvent(event, "vi");
    expect(vi.name).toBe("Lễ tốt nghiệp GRAD '26");
    expect(vi.venue.address).toBe("Vietnamese-German University");
    expect(vi.arrivalInfo).toBe("Park at gate B.");
    expect(vi.venue.name).toBe("Ceremony Hall");
  });

  it("leaves English untouched", () => {
    expect(localizeEvent(event, "en")).toBe(event);
  });
});
