import { describe, expect, it } from "vitest";
import { POST } from "./route";

function post(fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return POST(new Request("http://localhost/api/locale", { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } }));
}

describe("POST /api/locale (#9)", () => {
  it("stores the choice for a year and goes back to the same path", async () => {
    const response = await post({ lang: "vi", next: "/venue" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/venue");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^lang=vi;/);
    expect(cookie).toMatch(/Max-Age=31536000/);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("never sends a token or query string back", async () => {
    const response = await post({ lang: "en", next: "/invite/secret-token?x=1" });
    expect(response.headers.get("location")).toBe("/invite");
  });

  it("falls back to English and home for anything unexpected", async () => {
    const response = await post({ lang: "de", next: "https://evil.test/" });
    expect(response.headers.get("location")).toBe("/");
    expect(response.headers.get("set-cookie")).toMatch(/^lang=en;/);
  });
});
