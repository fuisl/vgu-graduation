import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function call(token: string, query = "") {
  return GET(new Request(`http://localhost/invite/${token}${query}`), { params: Promise.resolve({ token }) });
}

describe("GET /invite/[token]", () => {
  it("sets the inv cookie with secure attributes and redirects without the token", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("COOKIE_DOMAIN", ".grad26.example.dev");

    const res = await call("abc123token");

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/invite");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("cache-control")).toBe("no-store");

    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("inv=abc123token");
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toContain("Path=/");
    expect(cookie).toMatch(/Max-Age=\d+/i);
    expect(cookie).toMatch(/Domain=\.?grad26\.example\.dev/i);
  });

  it("is not Secure outside production and omits Domain when COOKIE_DOMAIN is unset", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("COOKIE_DOMAIN", "");

    const cookie = (await call("abc")).headers.get("set-cookie") ?? "";

    expect(cookie).not.toMatch(/Secure/i);
    expect(cookie).not.toMatch(/Domain=/i);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it("keeps a known answer through the redirect, without the token", async () => {
    for (const answer of ["yes", "no"]) {
      const res = await call("abc123token", `?answer=${answer}`);
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe(`/invite?answer=${answer}`);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("set-cookie")).toContain("inv=abc123token");
    }
  });

  it("ignores an unknown or repeated answer", async () => {
    for (const query of ["?answer=maybe", "?answer=YES", "?answer=", "?answer=yes&answer=no", "?answer=%3Cscript%3E", "?other=yes"]) {
      expect((await call("abc123token", query)).headers.get("location")).toBe("/invite");
    }
  });

  it("carries no answer for an absurdly long token", async () => {
    expect((await call("x".repeat(600), "?answer=yes")).headers.get("location")).toBe("/invite");
  });

  it("never calls the API: a mail scanner's GET can't write an RSVP", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await call("abc123token", "?answer=yes");
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("sets no cookie for an absurdly long token but still redirects", async () => {
    const res = await call("x".repeat(600));
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("location")).toBe("/invite");
  });
});
