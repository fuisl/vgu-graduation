import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mintAdminSession } from "../../../../../lib/auth/session";

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "admin_session" && cookieValue ? { value: cookieValue } : undefined) }),
}));

const { GET } = await import("./route");

const PUBLIC_ID = "Zx3_k9-photoId";

function call(publicId = PUBLIC_ID, variant = "thumb") {
  return GET(new Request(`http://localhost/admin/preview/${publicId}/${variant}`), {
    params: Promise.resolve({ publicId, variant }),
  });
}

function jpegResponse(init: ResponseInit = {}) {
  return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
    status: 200,
    headers: { "Content-Type": "image/jpeg", "Content-Length": "4", "Cache-Control": "no-store" },
    ...init,
  });
}

beforeEach(async () => {
  vi.stubEnv("ADMIN_SESSION_SECRET", "test-secret-for-preview-proxy");
  vi.stubEnv("API_ORIGIN", "http://api.internal:4000");
  cookieValue = await mintAdminSession("octo");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /admin/preview/:publicId/:variant", () => {
  it("streams the admin derivative with the session as a Bearer header and never caches it", async () => {
    const spy = vi.fn().mockResolvedValue(jpegResponse());
    vi.stubGlobal("fetch", spy);

    const response = await call();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-length")).toBe("4");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(`http://api.internal:4000/admin/media/${PUBLIC_ID}/thumb`);
    expect(url).not.toContain(cookieValue);
    expect(init.headers).toEqual({ Authorization: `Bearer ${cookieValue}` });
    expect(init.cache).toBe("no-store");
  });

  it("never puts the session token in the response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jpegResponse()));
    const response = await call();
    const headers = JSON.stringify([...response.headers.entries()]);
    expect(headers).not.toContain(cookieValue);
  });

  it("answers 401 without a valid admin session and does not call the API", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);

    cookieValue = undefined;
    expect((await call()).status).toBe(401);
    cookieValue = "forged.jwt.value";
    expect((await call()).status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  it("refuses unknown variants and malformed ids (no originals, no path tricks)", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);

    expect((await call(PUBLIC_ID, "original")).status).toBe(404);
    expect((await call("..%2F..%2Fadmin", "thumb")).status).toBe(404);
    expect((await call("a/b", "display")).status).toBe(404);
    expect(spy).not.toHaveBeenCalled();
  });

  it("passes the API's status through with an empty body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Service Unavailable", message: "later" }), {
          status: 503,
          headers: { "Retry-After": "30", "Content-Type": "application/json" },
        })
      )
    );

    const response = await call(PUBLIC_ID, "display");

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(response.headers.get("content-type")).toBeNull();
    expect(await response.text()).toBe("");
  });

  it("answers 502 when the API cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    expect((await call()).status).toBe(502);
  });
});
