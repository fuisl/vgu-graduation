import { describe, expect, it } from "vitest";
import { photoSources } from "./images";

const origin = "https://api.example.test";

describe("photoSources", () => {
  it("gives each derivative its real width, never an original", () => {
    const image = photoSources({ publicId: "p1", width: 4000, height: 3000 }, origin);
    expect(image.src).toBe("https://api.example.test/media/p1/thumb");
    expect(image.srcSet).toBe("https://api.example.test/media/p1/thumb 640w, https://api.example.test/media/p1/display 2048w");
    expect(image.displayUrl).toBe("https://api.example.test/media/p1/display");
    expect([image.width, image.height]).toEqual([640, 480]);
  });

  it("scales portrait photos by their longest edge", () => {
    const image = photoSources({ publicId: "p2", width: 3000, height: 4000 }, origin);
    expect(image.srcSet).toContain("thumb 480w");
    expect(image.srcSet).toContain("display 1536w");
    expect([image.width, image.height]).toEqual([480, 640]);
  });

  it("uses the thumb alone when the original is no bigger than it", () => {
    const image = photoSources({ publicId: "p3", width: 500, height: 400 }, origin);
    expect(image.srcSet).toBe("https://api.example.test/media/p3/thumb 500w");
  });

  it("assumes a square thumb while dimensions are unknown", () => {
    const image = photoSources({ publicId: "p4", width: null, height: null }, origin);
    expect([image.width, image.height]).toEqual([640, 640]);
    expect(image.srcSet).toContain("display 2048w");
  });
});
