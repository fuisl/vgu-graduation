import { describe, expect, it } from "vitest";
import { formValues } from "./action-state";
import { parseEventForm, parseGraduateForm, parseInvitationForm } from "./forms";

const GRAD_A = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e6f";
const GRAD_B = "3f2e8b1a-9c3d-4c9a-8b1e-1a2b3c4d5e70";

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("parseGraduateForm", () => {
  it("trims and lower-cases per the contract", () => {
    expect(parseGraduateForm(form([["name", "  An Nguyen "], ["email", " An@Example.com "]]))).toEqual({
      ok: true,
      data: { name: "An Nguyen", email: "an@example.com" },
    });
  });

  it("returns field errors for a missing name and a bad email", () => {
    const result = parseGraduateForm(form([["name", ""], ["email", "nope"]]));
    expect(result).toEqual({
      ok: false,
      errors: { name: "Enter a name (up to 120 characters)", email: "Enter a valid email address" },
    });
  });
});

describe("parseInvitationForm", () => {
  it("collects every checked inviter and drops empty optional fields", () => {
    const result = parseInvitationForm(
      form([
        ["guestName", "Jane Doe"],
        ["guestEmail", ""],
        ["guestPhone", " +84 90 000 0000 "],
        ["inviterUserIds", GRAD_A],
        ["inviterUserIds", GRAD_B],
        ["maxPlusOnes", "2"],
      ])
    );
    expect(result).toEqual({
      ok: true,
      data: { guestName: "Jane Doe", guestPhone: "+84 90 000 0000", inviterUserIds: [GRAD_A, GRAD_B], maxPlusOnes: 2 },
    });
  });

  it("requires a guest name and at least one inviter, and a whole plus-one count", () => {
    const result = parseInvitationForm(form([["guestName", " "], ["maxPlusOnes", "1.5"], ["guestEmail", "x"]]));
    expect(result).toEqual({
      ok: false,
      errors: {
        guestName: "Enter the guest's name",
        guestEmail: "Enter a valid email address, or leave it empty",
        inviterUserIds: "Choose at least one graduate",
        maxPlusOnes: "Enter a whole number, 0 or more",
      },
    });
  });
});

const validEvent: [string, string][] = [
  ["name", "VGU Graduation 2026"],
  ["timeZone", "Asia/Ho_Chi_Minh"],
  ["startsAt", "2026-11-21T09:00"],
  ["endsAt", "2026-11-21T12:00"],
  ["timeConfirmed", "on"],
  ["venueName", "VGU Campus"],
  ["venueAddress", "Ring Road 4, Thu Dau Mot"],
  ["venueMapUrl", "https://maps.example.com/vgu"],
  ["contactName", ""],
  ["contactEmail", ""],
  ["contactPhone", ""],
  ["arrivalInfo", ""],
];

function eventForm(overrides: Record<string, string | null> = {}): FormData {
  const entries = validEvent
    .map(([key, value]): [string, string | null] => [key, key in overrides ? overrides[key] : value])
    .filter((entry): entry is [string, string] => entry[1] !== null);
  return form(entries);
}

describe("parseEventForm", () => {
  it("converts local times in the event zone to ISO with offset and nulls empty optionals", () => {
    expect(parseEventForm(eventForm())).toEqual({
      ok: true,
      data: {
        name: "VGU Graduation 2026",
        startsAt: "2026-11-21T09:00:00+07:00",
        endsAt: "2026-11-21T12:00:00+07:00",
        timeZone: "Asia/Ho_Chi_Minh",
        timeConfirmed: true,
        venue: { name: "VGU Campus", address: "Ring Road 4, Thu Dau Mot", mapUrl: "https://maps.example.com/vgu" },
        contact: null,
        arrivalInfo: null,
      },
    });
  });

  it("treats an unchecked box as false, an empty end as null and keeps a partial contact", () => {
    const result = parseEventForm(
      eventForm({ timeConfirmed: null, endsAt: "", contactName: "Ms. Lan", contactPhone: "+84 1", arrivalInfo: "Gate 2" })
    );
    expect(result.ok && result.data).toMatchObject({
      timeConfirmed: false,
      endsAt: null,
      contact: { name: "Ms. Lan", email: null, phone: "+84 1" },
      arrivalInfo: "Gate 2",
    });
  });

  it("reports an end before the start on the end field", () => {
    expect(parseEventForm(eventForm({ endsAt: "2026-11-21T08:00" }))).toEqual({
      ok: false,
      errors: { endsAt: "The end must be after the start" },
    });
  });

  it("maps nested schema errors to form controls and requires a contact name", () => {
    const result = parseEventForm(eventForm({ name: "", venueMapUrl: "not a url", contactEmail: "a@b.co" }));
    expect(result).toEqual({
      ok: false,
      errors: {
        name: "Enter the event name",
        venueMapUrl: "Enter a full map link, starting with https://",
        contactName: "Enter a contact name, or clear the contact fields",
      },
    });
  });

  it("rejects an unknown time zone and a missing start", () => {
    expect(parseEventForm(eventForm({ timeZone: "Nowhere/Land" }))).toMatchObject({
      ok: false,
      errors: { timeZone: expect.any(String) },
    });
    expect(parseEventForm(eventForm({ startsAt: "" }))).toMatchObject({
      ok: false,
      errors: { startsAt: "Enter a valid start date and time" },
    });
  });
});

describe("formValues", () => {
  it("keeps repeated fields as arrays and skips Next's internal action fields", () => {
    const values = formValues(
      form([
        ["$ACTION_ID_abc", ""],
        ["guestName", "Jane"],
        ["inviterUserIds", GRAD_A],
        ["inviterUserIds", GRAD_B],
      ])
    );
    expect(values).toEqual({ guestName: "Jane", inviterUserIds: [GRAD_A, GRAD_B] });
  });
});
