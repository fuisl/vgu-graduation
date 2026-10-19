import { describe, expect, it } from "vitest";
import type { GalleryItem } from "../../../data/gallery";
import { arrivals, cameraProblem, seenFrom } from "./locket-logic";

const photo = (id: string, timestamp: string, pending?: "developing"): GalleryItem => ({
  id: `photo-${id}`,
  type: "POLAROID",
  sender: null,
  audience: "everyone",
  content: `https://api.test/media/${id}/display`,
  timestamp,
  publicId: id,
  ...(pending ? { pending } : {}),
});

describe("cameraProblem", () => {
  it("tells blocked, missing and busy cameras apart", () => {
    expect(cameraProblem(new DOMException("x", "NotAllowedError"))).toBe("denied");
    expect(cameraProblem(new DOMException("x", "SecurityError"))).toBe("denied");
    expect(cameraProblem(new DOMException("x", "NotFoundError"))).toBe("none");
    expect(cameraProblem(new DOMException("x", "OverconstrainedError"))).toBe("none");
    expect(cameraProblem(new DOMException("x", "NotReadableError"))).toBe("busy");
    expect(cameraProblem(new Error("anything else"))).toBe("busy");
    expect(cameraProblem(undefined)).toBe("busy");
  });
});

describe("arrivals (the 'N new' rule)", () => {
  const first = [photo("b", "2026-11-20T03:00:00.000Z"), photo("a", "2026-11-20T02:00:00.000Z")];

  it("goes straight in when the guest is at the top of the feed", () => {
    const seen = seenFrom(first);
    const next = [photo("c", "2026-11-20T04:00:00.000Z"), ...first];
    const { fresh, hold } = arrivals(next, seen, false);
    expect(fresh.map((item) => item.id)).toEqual(["photo-c"]);
    expect(hold).toEqual([]);
  });

  it("holds new arrivals while the guest reads further down, and counts each once", () => {
    const seen = seenFrom(first);
    const next = [photo("c", "2026-11-20T04:00:00.000Z"), ...first];
    expect(arrivals(next, seen, true).hold).toEqual(["photo-c"]);
    expect(arrivals(next, seen, true).hold).toEqual([]);
  });

  it("never holds the guest's own developing photo", () => {
    const seen = seenFrom(first);
    const next = [photo("mine", "2026-11-20T04:00:00.000Z", "developing"), ...first];
    expect(arrivals(next, seen, true).hold).toEqual([]);
  });

  it("does not treat older items from a catch-up snapshot as new", () => {
    const seen = seenFrom(first);
    const next = [...first, photo("old", "2026-11-19T10:00:00.000Z")];
    expect(arrivals(next, seen, true)).toEqual({ fresh: [], hold: [] });
  });
});
