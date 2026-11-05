import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const TOKEN = "sign-in-token-0123456";
const open = (token: string) => GET(new Request(`https://grad26.example.com/graduate/sign-in/${token}`), { params: Promise.resolve({ token }) });

afterEach(() => vi.unstubAllGlobals());

describe("GET /graduate/sign-in/[token]", () => {
  it("moves the token to a host-only HttpOnly cookie and out of the URL, with no API call: a scanner's GET spends nothing", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await open(TOKEN);
    expect(fetch).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/graduate/sign-in");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain(`grad_sign_in=${TOKEN}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/graduate/sign-in");
    expect(cookie).toContain("Max-Age=1800");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    expect(cookie.toLowerCase()).not.toContain("domain=");
  });

  it("gives something that isn't a token no cookie, so the next page says the link can't be used", async () => {
    const response = await open("a%20b");
    expect(response.status).toBe(303);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
