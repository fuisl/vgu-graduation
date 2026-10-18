import { describe, expect, it } from "vitest";
import {
  INITIAL_PREFIX,
  parseGraduateEditForm,
  parseGraduateForm,
  parseGuideItemForm,
  parseGuidePicksForm,
  parseInvitationEditForm,
  parseInvitationForm,
} from "./forms";

const ID = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";
const GRAD = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70";
const ITEM_A = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e71";
const ITEM_B = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e72";

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const item of [value].flat()) data.append(key, item);
  }
  return data;
}

/** An edit form whose fields still hold the values it was rendered with, plus `changes`. */
function editForm(initial: Record<string, string>, changes: Record<string, string> = {}): FormData {
  const entries: Record<string, string> = { id: ID };
  for (const [key, value] of Object.entries(initial)) {
    entries[`${INITIAL_PREFIX}${key}`] = value;
    if (key !== "nameReviewed") entries[key] = value;
  }
  return form({ ...entries, ...changes });
}

describe("create forms with given and family name (#170)", () => {
  it("sends the split the admin saw, so the API stores it as reviewed", () => {
    expect(
      parseGraduateForm(form({ name: "Nguyễn Văn An", givenName: " An ", familyName: "Nguyễn", email: "an@example.com" }))
    ).toEqual({ ok: true, data: { name: "Nguyễn Văn An", givenName: "An", familyName: "Nguyễn", email: "an@example.com" } });
  });

  it("sends an empty family name as null", () => {
    const result = parseInvitationForm(
      form({ guestName: "Madonna", guestGivenName: "Madonna", guestFamilyName: "", inviterUserIds: GRAD, maxPlusOnes: "0" })
    );
    expect(result).toEqual({
      ok: true,
      data: { guestName: "Madonna", guestGivenName: "Madonna", guestFamilyName: null, inviterUserIds: [GRAD], maxPlusOnes: 0 },
    });
  });

  it("leaves the split to the API (unreviewed) when no given name was submitted, e.g. without JS", () => {
    const result = parseInvitationForm(form({ guestName: "John Smith", guestFamilyName: "Smith", inviterUserIds: GRAD }));
    expect(result.ok && result.data).toEqual({ guestName: "John Smith", inviterUserIds: [GRAD] });
  });

  it("reports a too-long given name on its own field", () => {
    const result = parseGraduateForm(form({ name: "An", givenName: "x".repeat(121), email: "an@example.com" }));
    expect(result).toEqual({ ok: false, errors: { givenName: "Enter the given name (up to 120 characters)" } });
  });
});

describe("parseGraduateEditForm", () => {
  const initial = { name: "Tran Mai", givenName: "Mai", familyName: "Tran", email: "mai@example.com", nameReviewed: "true" };

  it("sends only the changed email", () => {
    expect(parseGraduateEditForm(editForm(initial, { email: "Mai@Example.org" }))).toEqual({
      ok: true,
      id: ID,
      data: { email: "mai@example.org" },
    });
  });

  it("sends all three name fields when any of them changed, so a full name alone never re-splits", () => {
    expect(parseGraduateEditForm(editForm(initial, { name: "Tran Thi Mai" }))).toEqual({
      ok: true,
      id: ID,
      data: { name: "Tran Thi Mai", givenName: "Mai", familyName: "Tran" },
    });
    expect(parseGraduateEditForm(editForm(initial, { familyName: "" }))).toMatchObject({
      ok: true,
      data: { name: "Tran Mai", givenName: "Mai", familyName: null },
    });
  });

  it("confirms an unreviewed name that was saved unchanged", () => {
    expect(parseGraduateEditForm(editForm({ ...initial, nameReviewed: "false" }))).toEqual({
      ok: true,
      id: ID,
      data: { nameReviewed: true },
    });
  });

  it("says when nothing changed, and rejects an unknown id or a blank given name", () => {
    expect(parseGraduateEditForm(editForm(initial))).toEqual({ ok: false, errors: { form: "Nothing changed." } });
    expect(parseGraduateEditForm(editForm(initial, { id: "nope", email: "x@example.com" }))).toEqual({
      ok: false,
      errors: { form: "Unknown graduate." },
    });
    expect(parseGraduateEditForm(editForm(initial, { givenName: " " }))).toEqual({
      ok: false,
      errors: { givenName: "Enter the given name (up to 120 characters)" },
    });
  });
});

describe("parseInvitationEditForm", () => {
  const initial = {
    guestName: "Jane Doe",
    guestGivenName: "Jane",
    guestFamilyName: "Doe",
    guestEmail: "jane@example.com",
    guestPhone: "",
    maxPlusOnes: "1",
    nameReviewed: "true",
  };

  it("clears the email with null and sends the new plus-one maximum", () => {
    expect(parseInvitationEditForm(editForm(initial, { guestEmail: "", maxPlusOnes: "3" }))).toEqual({
      ok: true,
      id: ID,
      data: { guestEmail: null, maxPlusOnes: 3 },
    });
  });

  it("sends the guest names together under their API field names", () => {
    expect(parseInvitationEditForm(editForm(initial, { guestGivenName: "Janie" }))).toEqual({
      ok: true,
      id: ID,
      data: { guestName: "Jane Doe", guestGivenName: "Janie", guestFamilyName: "Doe" },
    });
  });

  it("combines a name confirmation with other changes", () => {
    expect(parseInvitationEditForm(editForm({ ...initial, nameReviewed: "false" }, { guestPhone: "+84 90" }))).toEqual({
      ok: true,
      id: ID,
      data: { nameReviewed: true, guestPhone: "+84 90" },
    });
  });

  it("rejects a plus-one maximum outside 0 to 20 and a bad email", () => {
    expect(parseInvitationEditForm(editForm(initial, { maxPlusOnes: "21", guestEmail: "nope" }))).toEqual({
      ok: false,
      errors: {
        maxPlusOnes: "Enter a whole number from 0 to 20",
        guestEmail: "Enter a valid email address, or leave it empty",
      },
    });
    expect(parseInvitationEditForm(editForm(initial, { maxPlusOnes: "" }))).toMatchObject({
      ok: false,
      errors: { maxPlusOnes: "Enter a whole number from 0 to 20" },
    });
  });
});

describe("parseGuideItemForm (#140)", () => {
  it("nulls an empty map link and time hint and reads the shown checkbox", () => {
    expect(
      parseGuideItemForm(form({ title: " Library ", category: "explore", description: "", mapUrl: "", timeHint: "", sortOrder: "20" }))
    ).toEqual({
      ok: true,
      data: { title: "Library", category: "explore", description: "", mapUrl: null, timeHint: null, sortOrder: 20, active: false },
    });
    expect(parseGuideItemForm(form({ title: "Canteen", category: "food-drink", sortOrder: "", active: "on" }))).toMatchObject({
      ok: true,
      data: { sortOrder: 0, active: true },
    });
  });

  it("requires a title, a known category and an https map link", () => {
    expect(parseGuideItemForm(form({ title: "", category: "bars", mapUrl: "http://maps.example.com", sortOrder: "1.5" }))).toEqual({
      ok: false,
      errors: {
        title: "Enter a title (up to 120 characters)",
        category: "Choose a category",
        mapUrl: "Enter a full map link starting with https://, or leave it empty",
        sortOrder: "Enter a whole number from -10000 to 10000",
      },
    });
  });
});

describe("parseGuidePicksForm (#140)", () => {
  it("collects the checked items once each", () => {
    expect(parseGuidePicksForm(form({ invitationId: ID, intent: "save", itemIds: [ITEM_A, ITEM_B, ITEM_A] }))).toEqual({
      ok: true,
      id: ID,
      data: { itemIds: [ITEM_A, ITEM_B] },
    });
  });

  it("goes back to the defaults with an empty list, whatever is checked", () => {
    expect(parseGuidePicksForm(form({ invitationId: ID, intent: "defaults", itemIds: [ITEM_A] }))).toEqual({
      ok: true,
      id: ID,
      data: { itemIds: [] },
    });
    expect(parseGuidePicksForm(form({ invitationId: ID, intent: "save" }))).toMatchObject({ ok: true, data: { itemIds: [] } });
  });

  it("rejects an unknown invitation or item id", () => {
    expect(parseGuidePicksForm(form({ invitationId: "x" }))).toEqual({ ok: false, errors: { form: "Unknown invitation." } });
    expect(parseGuidePicksForm(form({ invitationId: ID, itemIds: "nope" }))).toMatchObject({ ok: false });
  });
});
