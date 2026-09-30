import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GET /api/gallery", () => {
  it("combines validated backend gallery and wish listings", async () => {
    vi.stubEnv("API_ORIGIN", "http://api.example.test");
    vi.stubEnv("PUBLIC_API_ORIGIN", "https://public-api.example.test");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const body = url.includes("/gallery?")
        ? { items: [{ publicId: "photo-id", width: 800, height: 600, createdAt: "2026-11-14T10:00:00.000Z" }], nextCursor: null }
        : { items: [{ id: "f2dbefb7-aaaf-43db-b5fb-97a431c4310e", authorName: "Guest", body: "Well done", createdAt: "2026-11-14T11:00:00.000Z" }], nextCursor: null };
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.partial).toBe(false);
    expect(body.items).toHaveLength(2);
    expect(body.items[1].content).toBe("https://public-api.example.test/media/photo-id/display");
  });
});
