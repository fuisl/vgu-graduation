import type { GuideCategory, GuideItem } from "@grad/contract";
import type { I18n } from "../i18n/dictionary";

/** The guide categories (#140) in filter order. Guest-facing names are the `guide.category.<category>` messages (#9). */
export const GUIDE_CATEGORIES: readonly GuideCategory[] = ["photo-spot", "food-drink", "explore", "relax", "practical"];

export type GuideFilter = GuideCategory | "all";

/** The categories that have at least one item, in filter order, so no pill ever shows an empty list. */
export function guideCategories(items: readonly GuideItem[]): GuideCategory[] {
  const present = new Set(items.map((item) => item.category));
  return GUIDE_CATEGORIES.filter((category) => present.has(category));
}

export function filterGuide(items: readonly GuideItem[], filter: GuideFilter): GuideItem[] {
  return filter === "all" ? [...items] : items.filter((item) => item.category === filter);
}

/** "An", "An and Binh", "An, Binh and Chi" (en-GB); "An, Binh và Chi" (vi-VN). */
export function joinNames(names: readonly string[], intl = "en-GB"): string {
  return new Intl.ListFormat(intl, { style: "long", type: "conjunction" }).format(names);
}

/** The hero line under the guide-book title. */
export function guideByline(tailored: boolean, inviterNames: readonly string[], { t, intl }: Pick<I18n, "t" | "intl">): string {
  if (tailored && inviterNames.length > 0) return t("guide.tailored", { names: joinNames(inviterNames, intl) });
  return t("guide.suggestions");
}
