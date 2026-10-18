import { describe, expect, it } from "vitest";
import { scrubPathname, scrubSpeedInsightsEvent, scrubUrl } from "./speed-insights";

const TOKEN = "q3T9vZ1xLk-_8bWm2NcYpA"; // 22 characters, the shape of a real 128-bit base64url token
const ORIGIN = "https://grad26.fuisloy.dev";

describe("scrubPathname", () => {
  it("rewrites an invitation token to the route pattern", () => {
    expect(scrubPathname(`/invite/${TOKEN}`)).toBe("/invite/[token]");
    expect(scrubPathname("/invite/abc")).toBe("/invite/[token]");
    expect(scrubPathname(`/Invite/${TOKEN}/extra`)).toBe("/Invite/[token]/extra");
  });

  it("keeps static routes as they are", () => {
    for (const path of ["/", "/invite", "/invite/", "/invite/demo", "/venue", "/gallery", "/about", "/design-system", "/guest/prototype"]) {
      expect(scrubPathname(path)).toBe(path);
    }
  });

  it("masks token-shaped segments anywhere in the path", () => {
    expect(scrubPathname(`/invites/${TOKEN}`)).toBe("/invites/[id]");
    expect(scrubPathname(`/${TOKEN}`)).toBe("/[id]");
  });
});

describe("scrubUrl", () => {
  it("drops the query string and fragment", () => {
    expect(scrubUrl(`${ORIGIN}/venue?ref=${TOKEN}#map`)).toBe(`${ORIGIN}/venue`);
    expect(scrubUrl(`${ORIGIN}/?t=${TOKEN}`)).toBe(`${ORIGIN}/`);
  });

  it("scrubs invitation paths with a query", () => {
    expect(scrubUrl(`${ORIGIN}/invite/${TOKEN}?utm=mail`)).toBe(`${ORIGIN}/invite/[token]`);
  });

  it("scrubs a percent-encoded token", () => {
    expect(scrubUrl(`${ORIGIN}/invite/${encodeURIComponent("a b/c")}`)).toBe(`${ORIGIN}/invite/[token]`);
  });

  it("handles relative routes", () => {
    expect(scrubUrl("/invite/[token]")).toBe("/invite/[token]");
    expect(scrubUrl(`/invite/${TOKEN}?x=1`)).toBe("/invite/[token]");
  });

  it("drops admin pages", () => {
    expect(scrubUrl(`${ORIGIN}/admin`)).toBeNull();
    expect(scrubUrl(`${ORIGIN}/admin/invitations?guest=1`)).toBeNull();
    expect(scrubUrl(`${ORIGIN}/administrator`)).toBe(`${ORIGIN}/administrator`);
  });

  it("never returns the token for any input", () => {
    const inputs = [
      `${ORIGIN}/invite/${TOKEN}`,
      `${ORIGIN}/invite/${TOKEN}/`,
      `${ORIGIN}/INVITE/${TOKEN}`,
      `${ORIGIN}/x?invite=${TOKEN}`,
      `${ORIGIN}/x#${TOKEN}`,
      `${ORIGIN}/foo/${TOKEN}/bar`,
    ];
    for (const input of inputs) expect(scrubUrl(input) ?? "").not.toContain(TOKEN);
  });
});

describe("scrubSpeedInsightsEvent", () => {
  it("scrubs both url and route", () => {
    expect(scrubSpeedInsightsEvent({ type: "vital", url: `${ORIGIN}/invite/${TOKEN}?a=b`, route: `/invite/${TOKEN}` })).toEqual({
      type: "vital",
      url: `${ORIGIN}/invite/[token]`,
      route: "/invite/[token]",
    });
  });

  it("leaves a missing route missing", () => {
    expect(scrubSpeedInsightsEvent({ type: "vital", url: `${ORIGIN}/wishes?page=2` })).toEqual({ type: "vital", url: `${ORIGIN}/wishes` });
  });

  it("drops admin events", () => {
    expect(scrubSpeedInsightsEvent({ type: "vital", url: `${ORIGIN}/admin/rsvps`, route: "/admin/rsvps" })).toBeNull();
  });
});
