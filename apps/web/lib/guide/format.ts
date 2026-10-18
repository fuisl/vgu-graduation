import type { GuideCategory, GuideItem } from "@grad/contract";

/** Guest-facing names of the guide categories (#140), in filter order. */
export const GUIDE_CATEGORY_LABELS: Record<GuideCategory, string> = {
  "photo-spot": "Photo spots",
  "food-drink": "Food and drink",
  explore: "Explore",
  relax: "Relax",
  practical: "Practical",
};

const ORDER = Object.keys(GUIDE_CATEGORY_LABELS) as GuideCategory[];

export type GuideFilter = GuideCategory | "all";

/** The categories that have at least one item, in filter order, so no pill ever shows an empty list. */
export function guideCategories(items: readonly GuideItem[]): GuideCategory[] {
  const present = new Set(items.map((item) => item.category));
  return ORDER.filter((category) => present.has(category));
}

export function filterGuide(items: readonly GuideItem[], filter: GuideFilter): GuideItem[] {
  return filter === "all" ? [...items] : items.filter((item) => item.category === filter);
}

/** "An", "An and Binh", "An, Binh and Chi". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The hero line under the guide-book title. */
export function guideByline(tailored: boolean, inviterNames: readonly string[]): string {
  if (tailored && inviterNames.length > 0) return `Tailored for you by ${joinNames(inviterNames)}.`;
  return "Suggestions from the graduates for the time between photos and speeches.";
}
