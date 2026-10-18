import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const TOKEN = "inv-secret-token";
const JOB = { id: "0b8f7a4c-5d1e-4f2a-9c3b-7e6d5a4b3c21", photoPublicId: "pub-1", copies: 1, status: "queued", createdAt: "2026-11-20T03:00:00.000Z" };

function request(method: "GET" | "POST", options: { cookie?: boolean; body?: unknown; contentType?: string } = {}) {
  const headers = new Headers();
  if (options.cookie !== false) headers.set("cookie", `inv=${TOKEN}`);
  if (method === "POST") headers.set("content-type", options.contentType ?? "application/json");
  return new NextRequest("http://web.test/api/print", {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(options.body ?? { photoPublicId: "pub-1" }) : undefined,
  });
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

beforeEach(() => vi.stubEnv("API_ORIGIN", "http://api.example.test"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("/api/print with guest prints off (the default)", () => {
  it("GET says disabled without calling the API", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await GET(request("GET"));
    expect(await response.json()).toEqual({ enabled: false, signedIn: false, perHour: 3 });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("POST is 403 without calling the API", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await POST(request("POST"));
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("/api/print with PRINT_GUEST_REQUESTS_ENABLED=true", () => {
  beforeEach(() => vi.stubEnv("PRINT_GUEST_REQUESTS_ENABLED", "true"));

  it("GET reports a signed-in guest from the invitation lookup", async () => {
    const invitation = {
      id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
      guest: { id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70", name: "Linh Tran", email: null, phone: null },
      maxPlusOnes: 0,
      status: "active",
      validFrom: null,
      validUntil: null,
      inviters: [],
      rsvp: null,
    };
    vi.stubGlobal("fetch", vi.fn(async () => json(invitation)));
    expect(await (await GET(request("GET"))).json()).toEqual({ enabled: true, signedIn: true, perHour: 3 });

    vi.stubGlobal("fetch", vi.fn(async () => json({ ...invitation, status: "revoked" })));
    expect((await (await GET(request("GET"))).json()).signedIn).toBe(false);

    const noCookie = await GET(request("GET", { cookie: false }));
    expect(await noCookie.json()).toEqual({ enabled: true, signedIn: false, perHour: 3 });
  });

  it("forwards one copy with the cookie as a bearer credential, never caching", async () => {
    const fetch = vi.fn(async () => json(JOB, 201));
    vi.stubGlobal("fetch", fetch);
    const response = await POST(request("POST"));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(JOB);

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.example.test/print/jobs");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(String(init.body))).toEqual({ photoPublicId: "pub-1", copies: 1 });
    expect(init.cache).toBe("no-store");
    // The token never comes back to the browser.
    expect(JSON.stringify(await POST(request("POST")).then((r) => r.json()))).not.toContain(TOKEN);
  });

  it("passes 429 through with Retry-After", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Too Many Requests", message: "slow down" }, 429, { "Retry-After": "3600" })));
    const response = await POST(request("POST"));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("3600");
    expect(await response.json()).toMatchObject({ retryAfterSeconds: 3600 });
  });

  it("passes 403 and 409 through", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Conflict", message: "Only visible, processed photos can be printed" }, 409)));
    expect((await POST(request("POST"))).status).toBe(409);
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Forbidden", message: "off" }, 403)));
    expect((await POST(request("POST"))).status).toBe(403);
  });

  it("answers 503 when the API is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect((await POST(request("POST"))).status).toBe(503);
  });

  it("rejects missing cookies, non-JSON bodies and missing photos before calling the API", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await POST(request("POST", { cookie: false }))).status).toBe(401);
    expect((await POST(request("POST", { contentType: "text/plain" }))).status).toBe(415);
    expect((await POST(request("POST", { body: { photoPublicId: "  " } }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
