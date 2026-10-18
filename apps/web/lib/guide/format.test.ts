import type { GuideItem } from "@grad/contract";
import { describe, expect, it } from "vitest";
import { filterGuide, guideByline, guideCategories, joinNames } from "./format";

const item = (id: string, category: GuideItem["category"]): GuideItem => ({
  id,
  title: id,
  category,
  description: "",
  mapUrl: null,
  timeHint: null,
  sortOrder: 0,
});

const items = [item("lake", "relax"), item("gate", "photo-spot"), item("cafe", "food-drink"), item("arch", "photo-spot")];

describe("guideCategories", () => {
  it("lists only categories with items, in filter order", () => {
    expect(guideCategories(items)).toEqual(["photo-spot", "food-drink", "relax"]);
    expect(guideCategories([])).toEqual([]);
  });
});

describe("filterGuide", () => {
  it("keeps the API order and filters by category", () => {
    expect(filterGuide(items, "all").map((i) => i.id)).toEqual(["lake", "gate", "cafe", "arch"]);
    expect(filterGuide(items, "photo-spot").map((i) => i.id)).toEqual(["gate", "arch"]);
    expect(filterGuide(items, "practical")).toEqual([]);
  });
});

describe("joinNames and guideByline", () => {
  it("joins names in plain English", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["An"])).toBe("An");
    expect(joinNames(["An", "Binh"])).toBe("An and Binh");
    expect(joinNames(["An", "Binh", "Chi"])).toBe("An, Binh and Chi");
  });

  it("names the graduates only when the guide is tailored", () => {
    expect(guideByline(true, ["An", "Binh"])).toBe("Tailored for you by An and Binh.");
    expect(guideByline(false, ["An"])).toMatch(/^Suggestions from the graduates/);
    expect(guideByline(true, [])).toMatch(/^Suggestions from the graduates/);
  });
});
