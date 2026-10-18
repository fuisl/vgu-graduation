import {
  ACCESSIBILITY_NEED_KEYS,
  GUIDE_DESCRIPTION_MAX_LENGTH,
  GUIDE_TIME_HINT_MAX_LENGTH,
  GUIDE_TITLE_MAX_LENGTH,
  guideCategorySchema,
} from "@grad/contract";
import { describe, expect, it } from "vitest";
import {
  ACCESSIBILITY_NEED_LABELS,
  ACCESSIBILITY_PLANNING_GROUPS,
  describeNeeds,
  GUIDE_CATEGORIES,
  GUIDE_LIMITS,
} from "./labels";
import { initialNameFields, nameFieldsReducer, type NameFieldsState } from "./name-fields";

function type(state: NameFieldsState, full: string): NameFieldsState {
  return nameFieldsReducer(state, { type: "full", value: full });
}

describe("name fields prefill (#170)", () => {
  it("follows the full name with the contract's split while untouched", () => {
    let state = initialNameFields();
    expect(state).toEqual({ full: "", given: "", family: "", manual: false });
    state = type(state, "Nguyễn Văn An");
    expect(state).toMatchObject({ given: "An", family: "Nguyễn", manual: false });
    state = type(state, "John Smith");
    expect(state).toMatchObject({ given: "John", family: "Smith" });
    state = type(state, "Mai Tran");
    expect(state).toMatchObject({ given: "Mai", family: "Tran" });
    state = type(state, "  ");
    expect(state).toMatchObject({ given: "", family: "" });
  });

  it("keeps the admin's own split when the full name changes afterwards, until they split again", () => {
    let state = type(initialNameFields(), "Le Thi Hoa");
    state = nameFieldsReducer(state, { type: "given", value: "Thi Hoa" });
    state = type(state, "Le Thi Hoa B");
    expect(state).toEqual({ full: "Le Thi Hoa B", given: "Thi Hoa", family: "Le", manual: true });
    state = nameFieldsReducer(state, { type: "resplit" });
    expect(state).toEqual({ full: "Le Thi Hoa B", given: "B", family: "Le", manual: false });
  });

  it("starts an edit form from the stored split, following the full name only if that split is the guess", () => {
    expect(initialNameFields("John Smith", "John", "Smith").manual).toBe(false);
    expect(initialNameFields("John Smith", "Johnny", "Smith").manual).toBe(true);
    expect(initialNameFields("Madonna", "Madonna", null)).toEqual({ full: "Madonna", given: "Madonna", family: "", manual: false });
  });
});

describe("client-safe copies of contract values", () => {
  it("match the contract's guide categories, limits and need order", () => {
    expect(GUIDE_CATEGORIES).toEqual(guideCategorySchema.options);
    expect(GUIDE_LIMITS).toEqual({
      title: GUIDE_TITLE_MAX_LENGTH,
      description: GUIDE_DESCRIPTION_MAX_LENGTH,
      timeHint: GUIDE_TIME_HINT_MAX_LENGTH,
    });
    expect(Object.keys(ACCESSIBILITY_NEED_LABELS)).toEqual([...ACCESSIBILITY_NEED_KEYS]);
  });
});

describe("accessibility labels (#176)", () => {
  it("puts every need in exactly one planning group", () => {
    const grouped = ACCESSIBILITY_PLANNING_GROUPS.flatMap((group) => group.keys);
    expect([...grouped].sort()).toEqual([...ACCESSIBILITY_NEED_KEYS].sort());
  });

  it("lists a guest's needs in display order", () => {
    const none = Object.fromEntries(ACCESSIBILITY_NEED_KEYS.map((key) => [key, false])) as Record<
      (typeof ACCESSIBILITY_NEED_KEYS)[number],
      boolean
    >;
    expect(describeNeeds({ ...none, companion: true, wheelchair: true, note: "x" })).toEqual([
      "Wheelchair space",
      "Companion seat",
    ]);
  });
});
