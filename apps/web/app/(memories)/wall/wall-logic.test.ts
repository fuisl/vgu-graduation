import { describe, expect, it } from "vitest";
import type { GalleryItem } from "../../../data/gallery";
import { lookupMessage } from "../../../lib/i18n/dictionary";
import {
  apiMessage,
  draftProblem,
  filterWall,
  isPostedWish,
  localShown,
  parseMode,
  parseShow,
  parseUploadResponse,
  shotCard,
  wallHref,
  wishCard,
  wishFailure,
  withoutListed,
} from "./wall-logic";

const wish = (id: string, timestamp: string): GalleryItem => ({ id: `wish-${id}`, type: "WISH", sender: "Linh", audience: "class", content: "Congrats", timestamp });
const photo = (id: string, timestamp: string): GalleryItem => ({
  id: `photo-${id}`,
  type: "POLAROID",
  sender: null,
  audience: "everyone",
  content: `https://api.test/media/${id}/display`,
  timestamp,
  publicId: id,
});

describe("mode and filter from the URL", () => {
  it("opens the camera only for ?mode=photo (or the old camera name)", () => {
    expect(parseMode("photo")).toBe("photo");
    expect(parseMode("Camera")).toBe("photo");
    expect(parseMode(["photo", "wish"])).toBe("photo");
    for (const value of [undefined, "", "wish", "video", []]) expect(parseMode(value)).toBe("wish");
  });

  it("picks a filter chip for ?show=wishes|photos and shows everything otherwise", () => {
    expect(parseShow("photos")).toBe("photos");
    expect(parseShow("WISHES")).toBe("wishes");
    for (const value of [undefined, "all", "videos", ["x"]]) expect(parseShow(value)).toBe("all");
  });

  it("builds the URL back, leaving defaults out", () => {
    expect(wallHref("wish", "all")).toBe("/wall");
    expect(wallHref("photo", "all")).toBe("/wall?mode=photo");
    expect(wallHref("wish", "photos")).toBe("/wall?show=photos");
    expect(wallHref("photo", "wishes")).toBe("/wall?mode=photo&show=wishes");
    // Round trip.
    const url = new URL(wallHref("photo", "photos"), "https://x.test");
    expect([parseMode(url.searchParams.get("mode") ?? undefined), parseShow(url.searchParams.get("show") ?? undefined)]).toEqual(["photo", "photos"]);
  });
});

describe("the mixed feed", () => {
  const items = [wish("a", "2026-11-20T03:05:00Z"), photo("p", "2026-11-20T03:04:00Z"), wish("b", "2026-11-20T03:03:00Z")];

  it("filters by chip and keeps the newest-first order", () => {
    expect(filterWall(items, "all").map((i) => i.id)).toEqual(["wish-a", "photo-p", "wish-b"]);
    expect(filterWall(items, "wishes").map((i) => i.id)).toEqual(["wish-a", "wish-b"]);
    expect(filterWall(items, "photos").map((i) => i.id)).toEqual(["photo-p"]);
    expect(filterWall(items, "all")).not.toBe(items);
  });

  it("files local (outbox) items under the right chip", () => {
    expect(localShown("wish", "all")).toBe(true);
    expect(localShown("photo", "photos")).toBe(true);
    expect(localShown("photo", "wishes")).toBe(false);
    expect(localShown("wish", "photos")).toBe(false);
  });

  it("de-duplicates by id: a local item the feed already lists is shown once", () => {
    const local = [
      { kind: "wish" as const, key: "k1", serverId: "a" },
      { kind: "wish" as const, key: "k2" },
      { kind: "photo" as const, key: "k3", serverId: "p" },
      { kind: "photo" as const, key: "k4", serverId: "q" },
    ];
    expect(withoutListed(local, new Set(items.map((i) => i.id))).map((i) => i.key)).toEqual(["k2", "k4"]);
  });
});

describe("the wish composer", () => {
  it("needs a message of 1 to 1000 characters", () => {
    expect(draftProblem("  ", "Linh", false)).toBe("message");
    expect(draftProblem("x".repeat(1001), "Linh", false)).toBe("message");
    expect(draftProblem("x".repeat(1000), "Linh", false)).toBeNull();
  });

  it("needs a name without an invitation, and lets an invited guest leave it blank", () => {
    expect(draftProblem("Congrats", " ", false)).toBe("name");
    expect(draftProblem("Congrats", "", true)).toBeNull();
    expect(draftProblem("Congrats", "x".repeat(61), true)).toBe("name");
    expect(draftProblem("Congrats", "x".repeat(60), false)).toBeNull();
  });

  it("shows each outbox state with the right actions", () => {
    expect(wishCard("sending")).toEqual({ status: "wishes.status.sending", tone: "pending", actions: [] });
    expect(wishCard("queued").actions).toEqual(["retry", "edit"]);
    expect(wishCard("failed")).toMatchObject({ tone: "error", actions: ["retry", "edit"] });
    expect(wishCard("rejected")).toMatchObject({ tone: "error", actions: ["edit"] });
    expect(wishCard("sent")).toMatchObject({ tone: "done", actions: [] });
  });
});

describe("wishFailure (POST /wishes errors)", () => {
  it("keeps the wish for Retry when trying again can work", () => {
    expect(wishFailure("network")).toEqual({ key: "wishes.error.network", retry: true });
    expect(wishFailure(429)).toEqual({ key: "wishes.error.tooMany", retry: true });
    expect(wishFailure(503)).toEqual({ key: "wishes.error.generic", retry: true });
  });

  it("shows the word filter's own message inline, and sends the wish back to be changed", () => {
    expect(wishFailure(422, { error: "Unprocessable Entity", message: "  Please keep it kind.  " })).toEqual({
      key: "wishes.error.filtered",
      retry: false,
      text: "Please keep it kind.",
    });
    // No usable message: our own line.
    expect(wishFailure(422, { message: "" })).toEqual({ key: "wishes.error.filtered", retry: false });
    expect(wishFailure(422, null)).toEqual({ key: "wishes.error.filtered", retry: false });
    expect(wishFailure(422, { message: "x".repeat(301) })).toEqual({ key: "wishes.error.filtered", retry: false });
  });

  it("asks for a change on a bad length, and names invitation problems", () => {
    expect(wishFailure(400)).toEqual({ key: "wishes.error.length", retry: false });
    expect(wishFailure(401).key).toBe("wishes.error.invalid");
    expect(wishFailure(410).key).toBe("wishes.error.expired");
    expect(wishFailure(418)).toEqual({ key: "wishes.error.generic", retry: false });
  });

  it("uses the agreed rate-limit wording", () => {
    expect(lookupMessage("en", wishFailure(429).key)).toBe("You're posting quickly — try again in a few minutes.");
  });

  it("reads only a string `message` from the API", () => {
    expect(apiMessage({ message: 42 })).toBeNull();
    expect(apiMessage("nope")).toBeNull();
    expect(apiMessage({ message: "Too rude" })).toBe("Too rude");
  });

  it("checks the 201 body before keeping it", () => {
    expect(isPostedWish({ id: "w1", authorName: "Linh", body: "Hi", createdAt: "2026-11-20T03:00:00Z" })).toBe(true);
    expect(isPostedWish({ id: "w1", body: "Hi" })).toBe(false);
  });
});

describe("parseUploadResponse (POST /media, ADR-019)", () => {
  it("reads an invited guest's upload: visible, with the roll count", () => {
    expect(parseUploadResponse({ publicId: "p1", processingStatus: "pending", shotsRemaining: 35, reviewStatus: "visible" })).toEqual({
      publicId: "p1",
      shotsRemaining: 35,
      reviewStatus: "visible",
    });
  });

  it("reads an anonymous upload: pending review, with no roll", () => {
    expect(parseUploadResponse({ publicId: "p2", processingStatus: "pending", reviewStatus: "pending" })).toEqual({
      publicId: "p2",
      shotsRemaining: null,
      reviewStatus: "pending",
    });
    expect(parseUploadResponse({ publicId: "p2", shotsRemaining: null, reviewStatus: "pending" })?.shotsRemaining).toBeNull();
  });

  it("treats an older API without reviewStatus as visible", () => {
    expect(parseUploadResponse({ publicId: "p3", processingStatus: "ready", shotsRemaining: 0 })?.reviewStatus).toBe("visible");
  });

  it("refuses malformed bodies", () => {
    for (const body of [null, "x", {}, { publicId: "" }, { publicId: "p", reviewStatus: "approved" }, { publicId: "p", shotsRemaining: -1 }, { publicId: "p", processingStatus: "done" }]) {
      expect(parseUploadResponse(body)).toBeNull();
    }
  });

  it("shows a sent photo as waiting for approval when the API holds it", () => {
    expect(shotCard("sent", "pending")).toEqual({ status: "wall.waiting", tone: "pending", actions: [] });
    expect(shotCard("sent", "visible")).toEqual({ status: "camera.status.sent", tone: "done", actions: [] });
    expect(shotCard("failed").actions).toEqual(["retry"]);
    expect(shotCard("rejected").actions).toEqual(["remove"]);
  });
});
