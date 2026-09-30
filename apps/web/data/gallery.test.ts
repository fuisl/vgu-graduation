import { describe, expect, it } from "vitest";
import { buildGalleryItems } from "./gallery";

describe("buildGalleryItems", () => {
  it("combines real photo and wish responses newest first", () => {
    const items = buildGalleryItems(
      {
        items: [{ publicId: "photo-id", width: 800, height: 600, createdAt: "2026-11-14T10:00:00.000Z" }],
        nextCursor: null,
      },
      {
        items: [{
          id: "f2dbefb7-aaaf-43db-b5fb-97a431c4310e",
          authorName: "A guest",
          body: "Congratulations!",
          createdAt: "2026-11-14T11:00:00.000Z",
        }],
        nextCursor: null,
      },
      "https://api.example.test",
    );

    expect(items.map((item) => item.type)).toEqual(["WISH", "POLAROID"]);
    expect(items[0]).toMatchObject({ sender: "A guest", content: "Congratulations!" });
    expect(items[1].content).toBe("https://api.example.test/media/photo-id/display");
  });
});
