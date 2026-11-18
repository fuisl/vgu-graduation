import { describe, expect, it } from "vitest";
import type { GalleryItem } from "../../data/gallery";
import { OWN_POST_REVIEW_TTL_MS, OWN_POST_TTL_MS, forgetOwnPosts, mergeOwnPosts, readOwnPosts, rememberOwnPost, type OwnPost } from "./own-posts";

function memoryStore() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

const T = Date.UTC(2026, 10, 15, 3, 0, 0);
const iso = (s: number) => new Date(T + s * 1000).toISOString();
const ownWish: OwnPost = { kind: "wish", id: "w1", authorName: "Linh", body: "Congrats", createdAt: iso(10), savedAt: T };
const ownPhoto: OwnPost = { kind: "photo", publicId: "p1", preview: "data:image/jpeg;base64,AAAA", createdAt: iso(20), savedAt: T };
const listed: GalleryItem = { id: "wish-w0", type: "WISH", sender: "A", audience: "class", content: "Old", timestamp: iso(0) };

describe("own posts", () => {
  it("remembers, expires and forgets", () => {
    const store = memoryStore();
    rememberOwnPost(ownWish, store);
    rememberOwnPost(ownPhoto, store);
    expect(readOwnPosts(T + 1, store).map((p) => p.kind)).toEqual(["photo", "wish"]);
    forgetOwnPosts(["wish:w1"], T + 1, store);
    expect(readOwnPosts(T + 1, store).map((p) => p.kind)).toEqual(["photo"]);
    expect(readOwnPosts(T + OWN_POST_TTL_MS, store)).toEqual([]);
  });

  it("survives broken or blocked storage", () => {
    const broken = { getItem: () => "{nope", setItem: () => { throw new Error("quota"); } };
    expect(readOwnPosts(T, broken)).toEqual([]);
    expect(() => rememberOwnPost(ownWish, broken)).not.toThrow();
    expect(readOwnPosts(T, null)).toEqual([]);
  });

  it("shows a developing photo from its preview until the feed lists it", () => {
    const { items } = mergeOwnPosts([listed], [ownPhoto], true);
    expect(items[0]).toMatchObject({ id: "photo-p1", pending: "developing", content: ownPhoto.kind === "photo" ? ownPhoto.preview : "" });
    expect(items[0]!.publicId).toBeUndefined(); // no print request for a photo still processing

    const arrived: GalleryItem = { id: "photo-p1", type: "POLAROID", sender: null, audience: "everyone", content: "https://api/x", timestamp: iso(20), publicId: "p1" };
    const after = mergeOwnPosts([arrived, listed], [ownPhoto], true);
    expect(after.items).toEqual([arrived, listed]);
    expect(after.seen).toEqual(["photo:p1"]);
  });

  it("keeps a photo waiting for approval as `waiting`, for longer, until an organizer approves it (ADR-019)", () => {
    const waiting: OwnPost = { kind: "photo", publicId: "p2", preview: "data:image/jpeg;base64,BBBB", createdAt: iso(30), savedAt: T, review: "pending" };
    const store = memoryStore();
    rememberOwnPost(waiting, store);
    rememberOwnPost(ownPhoto, store);
    // The plain "developing" copy expires with the usual TTL; the waiting one stays.
    expect(readOwnPosts(T + OWN_POST_TTL_MS, store).map((p) => (p.kind === "photo" ? p.publicId : ""))).toEqual(["p2"]);
    expect(readOwnPosts(T + OWN_POST_REVIEW_TTL_MS, store)).toEqual([]);

    const { items } = mergeOwnPosts([listed], [waiting], true);
    expect(items[0]).toMatchObject({ id: "photo-p2", pending: "waiting" });
    const approved: GalleryItem = { id: "photo-p2", type: "POLAROID", sender: null, audience: "everyone", content: "https://api/y", timestamp: iso(30), publicId: "p2" };
    expect(mergeOwnPosts([approved], [waiting], true)).toEqual({ items: [approved], seen: ["photo:p2"] });
  });

  it("ignores a stored photo with an unknown review state", () => {
    const store = memoryStore();
    store.setItem("grad26.own-posts", JSON.stringify([{ ...ownPhoto, review: "approved" }]));
    expect(readOwnPosts(T, store)).toEqual([]);
  });

  it("bridges an own wish only until the feed's first snapshot, so a takedown is never undone", () => {
    expect(mergeOwnPosts([listed], [ownWish], false).items.map((i) => i.id)).toEqual(["wish-w1", "wish-w0"]);
    expect(mergeOwnPosts([listed], [ownWish], true).items.map((i) => i.id)).toEqual(["wish-w0"]);
  });
});
