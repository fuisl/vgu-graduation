import type { AccessibilityNeedKey, AccessibilityNeeds, GuideCategory } from "@grad/contract";

/*
 * Admin wording for contract enums. Client components import this file, so it
 * takes only types from @grad/contract: a value import would pull the whole
 * contract barrel, zod included, into the admin bundle. Tests keep the copies
 * below in step with the contract.
 */

/** Guide-book categories (#140), in the order the form offers them. */
export const GUIDE_CATEGORY_LABELS: Record<GuideCategory, string> = {
  "photo-spot": "Photo spot",
  "food-drink": "Food and drink",
  explore: "Explore",
  relax: "Relax",
  practical: "Practical",
};
export const GUIDE_CATEGORIES = Object.keys(GUIDE_CATEGORY_LABELS) as GuideCategory[];

/** Same limits as GUIDE_*_MAX_LENGTH in packages/contract/src/guide.ts. */
export const GUIDE_LIMITS = { title: 120, description: 500, timeHint: 80 } as const;

/** Short labels for the accessibility needs (#176), as the venue team plans for them, in ACCESSIBILITY_NEED_KEYS order. */
export const ACCESSIBILITY_NEED_LABELS: Record<AccessibilityNeedKey, string> = {
  wheelchair: "Wheelchair space",
  stepFreeAccess: "Step-free access",
  captions: "Captions on phone",
  seatNearSpeakers: "Seat near speakers",
  largePrint: "Large-print programme",
  visionAssistance: "Guide on arrival",
  seatNearFront: "Seat near the front",
  aisleSeat: "Aisle seat",
  companion: "Companion seat",
};

/** The summary, grouped by what the venue staff prepare. Every need key appears exactly once. */
export const ACCESSIBILITY_PLANNING_GROUPS: readonly { title: string; keys: readonly AccessibilityNeedKey[] }[] = [
  { title: "Mobility", keys: ["wheelchair", "stepFreeAccess"] },
  { title: "Hearing", keys: ["captions", "seatNearSpeakers"] },
  { title: "Vision", keys: ["largePrint", "visionAssistance"] },
  { title: "Seating and companions", keys: ["seatNearFront", "aisleSeat", "companion"] },
];

/** The stated needs of one guest as labels, in display order. */
export function describeNeeds(needs: AccessibilityNeeds): string[] {
  return (Object.keys(ACCESSIBILITY_NEED_LABELS) as AccessibilityNeedKey[])
    .filter((key) => needs[key])
    .map((key) => ACCESSIBILITY_NEED_LABELS[key]);
}
