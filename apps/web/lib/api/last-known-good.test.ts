import { describe, expect, it } from "vitest";
import { isCredentialRefusal, LastKnownGood, lastKnownGoodStore, mayUseLastKnownGood } from "./last-known-good";

describe("LastKnownGood", () => {
  it("expires entries after the time to live", () => {
    const store = new LastKnownGood<string>({ maxEntries: 10, ttlMs: 1000 });
    store.set("a", "x", 0);
    expect(store.get("a", 1000)).toBe("x");
    expect(store.get("a", 1001)).toBeUndefined();
    expect(store.get("a", 0)).toBeUndefined();
  });

  it("drops the oldest entry beyond the limit", () => {
    const store = new LastKnownGood<string>({ maxEntries: 2, ttlMs: 1000 });
    store.set("a", "1", 0);
    store.set("b", "2", 0);
    store.set("a", "1 again", 0);
    store.set("c", "3", 0);
    expect(store.get("b", 0)).toBeUndefined();
    expect(store.get("a", 0)).toBe("1 again");
    expect(store.get("c", 0)).toBe("3");
  });

  it("deletes by value and returns the keys", () => {
    const store = new LastKnownGood<{ id: string }>({ maxEntries: 10, ttlMs: 1000 });
    store.set("h1", { id: "inv" }, 0);
    store.set("h2", { id: "inv" }, 0);
    store.set("h3", { id: "other" }, 0);
    expect(store.deleteWhere((value) => value.id === "inv")).toEqual(["h1", "h2"]);
    expect(store.get("h1", 0)).toBeUndefined();
    expect(store.get("h3", 0)).toEqual({ id: "other" });
  });
});

describe("lastKnownGoodStore", () => {
  it("returns one shared store per name", () => {
    expect(lastKnownGoodStore("test-a")).toBe(lastKnownGoodStore("test-a"));
    expect(lastKnownGoodStore("test-a")).not.toBe(lastKnownGoodStore("test-b"));
  });
});

describe("status rules", () => {
  it("falls back only on a network error or a 5xx, never on a refusal", () => {
    expect(mayUseLastKnownGood(undefined)).toBe(true);
    for (const status of [500, 502, 503, 504]) expect(mayUseLastKnownGood(status)).toBe(true);
    for (const status of [400, 401, 403, 404, 410, 429]) expect(mayUseLastKnownGood(status)).toBe(false);
    for (const status of [401, 403, 404, 410]) expect(isCredentialRefusal(status)).toBe(true);
    for (const status of [200, 400, 429, 500]) expect(isCredentialRefusal(status)).toBe(false);
  });
});
