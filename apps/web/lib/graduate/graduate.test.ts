import { describe, expect, it } from "vitest";
import { graduateSessionCookieOptions, graduateSignInCookieOptions } from "./cookie";
import { filterGuests, summarizeGuests } from "./guests";

const guests = [
  { name: "Nguyễn Văn An", email: "an@example.com", status: "attending" as const },
  { name: "Đỗ Thị Bình", email: "binh@example.com", status: "declined" as const },
  { name: "Chi Pham", email: null, status: "pending" as const },
  { name: "Dung Tran", email: "dung@example.com", status: "pending" as const },
];

describe("summarizeGuests", () => {
  it("counts each answer, zero for none", () => {
    expect(summarizeGuests(guests)).toEqual({ attending: 1, declined: 1, pending: 2 });
    expect(summarizeGuests([])).toEqual({ attending: 0, declined: 0, pending: 0 });
  });
});

describe("filterGuests", () => {
  const names = (query: string, filter: Parameters<typeof filterGuests>[2] = "all") => filterGuests(guests, query, filter).map((g) => g.name);

  it("searches names and emails, ignoring case and diacritics", () => {
    expect(names("nguyen van")).toEqual(["Nguyễn Văn An"]);
    expect(names("do thi")).toEqual(["Đỗ Thị Bình"]);
    expect(names("DUNG@")).toEqual(["Dung Tran"]);
    expect(names("  ")).toHaveLength(4);
    expect(names("nobody")).toEqual([]);
  });

  it("filters by answer, together with the search", () => {
    expect(names("", "pending")).toEqual(["Chi Pham", "Dung Tran"]);
    expect(names("chi", "pending")).toEqual(["Chi Pham"]);
    expect(names("chi", "attending")).toEqual([]);
  });
});

describe("portal cookies", () => {
  it("are HttpOnly and SameSite=Lax, Secure only in production", () => {
    expect(graduateSessionCookieOptions({ NODE_ENV: "production" })).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax" });
    expect(graduateSessionCookieOptions({ NODE_ENV: "development" }).secure).toBe(false);
    expect(graduateSignInCookieOptions({ NODE_ENV: "production" })).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax" });
  });

  it("have no Domain: host-only on the web host, so they never reach the API host", () => {
    expect(graduateSessionCookieOptions()).not.toHaveProperty("domain");
    expect(graduateSignInCookieOptions()).not.toHaveProperty("domain");
  });

  it("last about 30 days and 30 minutes, under the portal's paths", () => {
    expect(graduateSessionCookieOptions()).toMatchObject({ path: "/graduate", maxAge: 30 * 24 * 60 * 60 });
    expect(graduateSignInCookieOptions()).toMatchObject({ path: "/graduate/sign-in", maxAge: 30 * 60 });
  });
});
