import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/wishes", () => {
  it("requires the invitation cookie", async () => {
    const response = await POST(new NextRequest("http://localhost:3000/api/wishes", {
      method: "POST",
      body: JSON.stringify({ body: "Congratulations" }),
      headers: { "Content-Type": "application/json" },
    }));

    expect(response.status).toBe(401);
  });

  it("forwards a valid wish to the backend with the credential", async () => {
    vi.stubEnv("API_ORIGIN", "http://api.example.test");
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "f2dbefb7-aaaf-43db-b5fb-97a431c4310e",
      authorName: "Guest",
      body: "Congratulations",
      createdAt: "2026-11-14T11:00:00.000Z",
    }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchSpy);

    const response = await POST(new NextRequest("http://localhost:3000/api/wishes", {
      method: "POST",
      body: JSON.stringify({ body: "Congratulations" }),
      headers: { "Content-Type": "application/json", cookie: "inv=test-invitation-token" },
    }));

    expect(response.status).toBe(201);
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://api.example.test/wishes",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-invitation-token" }),
      }),
    );
  });
});
