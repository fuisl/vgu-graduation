import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("POST /admin/logout", () => {
  it("expires the session cookie on the same domain it was set on, then redirects with GET", async () => {
    vi.stubEnv("COOKIE_DOMAIN", ".grad26.fuisloy.dev");
    const response = await POST(new NextRequest("https://grad26.fuisloy.dev/admin/logout", { method: "POST" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://grad26.fuisloy.dev/admin/login");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^admin_session=;/);
    expect(setCookie).toMatch(/Domain=\.?grad26\.fuisloy\.dev/i);
    expect(setCookie).toMatch(/Path=\//i);
    expect(setCookie).toMatch(/Max-Age=0/i);
  });

  it("works without COOKIE_DOMAIN (local dev)", async () => {
    vi.stubEnv("COOKIE_DOMAIN", "");
    const response = await POST(new NextRequest("http://localhost:3000/admin/logout", { method: "POST" }));
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/Max-Age=0/i);
    expect(setCookie).not.toMatch(/Domain=/i);
  });
});
