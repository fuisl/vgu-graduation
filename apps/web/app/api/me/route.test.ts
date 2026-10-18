import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const TOKEN = "secret-invitation-token-123";
const invitation = {
  id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f",
  guest: {
    id: "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70",
    name: "Linh Tran",
    givenName: "Linh",
    familyName: "Tran",
    email: "linh@example.com",
    phone: "+84123",
  },
  maxPlusOnes: 1,
  status: "active",
  validFrom: null,
  validUntil: null,
  inviters: [],
  rsvp: null,
};

function request(withCookie: boolean) {
  return new NextRequest("http://localhost:3000/api/me", {
    headers: withCookie ? { cookie: `inv=${TOKEN}` } : {},
  });
}

function stubApi(status: number, body: unknown = {}) {
  const spy = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GET /api/me", () => {
  it("is signed out without the cookie and never calls the API", async () => {
    const spy = stubApi(200, invitation);
    const response = await GET(request(false));
    expect(await response.json()).toEqual({ signedIn: false });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns only givenName and avatarSeed for a valid invitation", async () => {
    vi.stubEnv("API_ORIGIN", "http://api.example.test");
    const spy = stubApi(200, invitation);
    const response = await GET(request(true));
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ signedIn: true, givenName: "Linh", avatarSeed: invitation.guest.id });
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain("linh@example.com");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(spy).toHaveBeenCalledWith(
      "http://api.example.test/invitations/me",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }) }),
    );
  });

  it.each([
    [{ name: "Nguyễn Văn An", givenName: "An", familyName: "Nguyễn" }, "An"],
    [{ name: "John Smith", givenName: "John", familyName: "Smith" }, "John"],
    [{ name: "Madonna", givenName: "Madonna", familyName: null }, "Madonna"],
  ])("uses the guest's givenName for %j (#170)", async (names, expected) => {
    vi.stubEnv("API_ORIGIN", "http://api.example.test");
    stubApi(200, { ...invitation, guest: { ...invitation.guest, ...names } });
    const response = await GET(request(true));
    expect((await response.json()).givenName).toBe(expected);
  });

  it("falls back to the shared name rules when the API omits givenName", async () => {
    const { givenName: _given, familyName: _family, ...older } = invitation.guest;
    stubApi(200, { ...invitation, guest: { ...older, name: "John Smith" } });
    expect((await (await GET(request(true))).json()).givenName).toBe("John");
  });

  it.each([401, 404, 410, 500])("is signed out when the API answers %i", async (status) => {
    stubApi(status);
    const response = await GET(request(true));
    expect(await response.json()).toEqual({ signedIn: false });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("is signed out for a revoked invitation", async () => {
    stubApi(200, { ...invitation, status: "revoked" });
    expect(await (await GET(request(true))).json()).toEqual({ signedIn: false });
  });

  it("is signed out when the API is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    const response = await GET(request(true));
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ signedIn: false });
    expect(text).not.toContain(TOKEN);
  });
});
