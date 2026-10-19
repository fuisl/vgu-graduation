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

  it("decodes before scrubbing, so an encoded slash cannot hide the invitation token", () => {
    expect(scrubPathname(`/invite%2F${TOKEN}`)).toBe("/invite/[token]");
    expect(scrubPathname(`/invite%252F${TOKEN}`)).toBe("/invite/[token]");
    expect(scrubPathname(`/%69nvite/${TOKEN}`)).toBe("/invite/[token]");
  });

  it("masks token-length runs inside a segment", () => {
    expect(scrubPathname(`/x/${TOKEN}~`)).toBe("/x/[id]~");
    expect(scrubPathname(`/${TOKEN}.`)).toBe("/[id].");
    expect(scrubPathname(`/x/${TOKEN}%20`)).toBe("/x/[id]%20");
    expect(scrubPathname(`/x/a.${TOKEN}.b`)).toBe("/x/a.[id].b");
  });

  it("fails closed on malformed percent-encoding", () => {
    expect(scrubPathname(`/x/${TOKEN}%`)).toBeNull();
    expect(scrubPathname(`/x/%E0%A4%A/${TOKEN}`)).toBeNull();
  });

  it("drops admin paths however they are cased or encoded", () => {
    expect(scrubPathname("/admin")).toBeNull();
    expect(scrubPathname("/%61dmin/invitations")).toBeNull();
    expect(scrubPathname("/%2561dmin")).toBeNull();
    expect(scrubPathname("/ADMIN/rsvp")).toBeNull();
    expect(scrubPathname("/%2Fadmin")).toBeNull();
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
    expect(scrubUrl(`${ORIGIN}/invite/${encodeURIComponent("a b")}`)).toBe(`${ORIGIN}/invite/[token]`);
    // The path is decoded first, so an encoded slash splits the segment like a real one would.
    expect(scrubUrl(`${ORIGIN}/invite/${encodeURIComponent(`a b/${TOKEN}`)}`)).toBe(`${ORIGIN}/invite/[token]/[id]`);
  });

  it("handles relative routes", () => {
    expect(scrubUrl("/invite/[token]")).toBe("/invite/[token]");
    expect(scrubUrl(`/invite/${TOKEN}?x=1`)).toBe("/invite/[token]");
  });

  it("drops admin pages", () => {
    expect(scrubUrl(`${ORIGIN}/admin`)).toBeNull();
    expect(scrubUrl(`${ORIGIN}/admin/invitations?guest=1`)).toBeNull();
    expect(scrubUrl(`${ORIGIN}/administrator`)).toBe(`${ORIGIN}/administrator`);
    expect(scrubUrl(`${ORIGIN}/%61dmin/invitations`)).toBeNull();
    expect(scrubUrl(`${ORIGIN}/%41DMIN`)).toBeNull();
  });

  it("drops a URL whose path does not decode", () => {
    expect(scrubUrl(`${ORIGIN}/invite/${TOKEN}%zz`)).toBeNull();
  });

  it("never returns the token for any input", () => {
    const inputs = [
      `${ORIGIN}/invite/${TOKEN}`,
      `${ORIGIN}/invite/${TOKEN}/`,
      `${ORIGIN}/INVITE/${TOKEN}`,
      `${ORIGIN}/x?invite=${TOKEN}`,
      `${ORIGIN}/x#${TOKEN}`,
      `${ORIGIN}/foo/${TOKEN}/bar`,
      `${ORIGIN}/invite%2F${TOKEN}`,
      `${ORIGIN}/x/${TOKEN}~`,
      `${ORIGIN}/${TOKEN}.`,
      `${ORIGIN}/x/${TOKEN}%20`,
      `${ORIGIN}/x/${TOKEN} `,
      `${ORIGIN}/x/${encodeURIComponent(encodeURIComponent(TOKEN + "!"))}`,
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
