import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function call(token: string) {
  return GET(new Request(`http://localhost/invite/${token}`), { params: Promise.resolve({ token }) });
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

  it("sets no cookie for an absurdly long token but still redirects", async () => {
    const res = await call("x".repeat(600));
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("location")).toBe("/invite");
  });
});
