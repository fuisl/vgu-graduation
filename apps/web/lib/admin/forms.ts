import {
  createGraduateRequestSchema,
  createGuideItemRequestSchema,
  createInvitationRequestSchema,
  updateEventRequestSchema,
  updateGraduateRequestSchema,
  updateInvitationRequestSchema,
  type CreateGraduateRequest,
  type CreateGuideItemRequest,
  type CreateInvitationRequest,
  type UpdateEventRequest,
  type UpdateGraduateRequest,
  type UpdateInvitationRequest,
} from "@grad/contract";
import { INITIAL_PREFIX } from "./action-state";
import { isValidTimeZone, zonedLocalToIso } from "./datetime";

/**
 * FormData → contract request parsing for the admin forms. Pure, so the
 * Server Actions stay thin and the rules are unit-tested. Field errors are
 * keyed by the form control's `name`.
 */

export type FieldErrors = Record<string, string>;
export type ParseResult<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

interface Issue {
  path: PropertyKey[];
  message: string;
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(form: FormData, name: string): string | undefined {
  return text(form, name) || undefined;
}

function collectIssues(issues: readonly Issue[], fieldFor: (path: PropertyKey[]) => string): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const field = fieldFor(issue.path);
    errors[field] ??= issue.message;
  }
  return errors;
}

function wholeNumber(raw: string): number | undefined {
  return raw === "" ? undefined : Number(raw);
}

/**
 * Given and family name on a create form (#170). With JS the form prefills
 * both from the full name (lib/admin/name-fields.ts), so a submitted given
 * name is one the admin has seen: it is sent explicitly and stored as
 * reviewed. An empty given name (e.g. without JS) sends neither, and the API
 * splits the full name itself, unreviewed.
 */
function createNames(form: FormData, givenField: string, familyField: string) {
  const givenName = text(form, givenField);
  return givenName ? { givenName, familyName: text(form, familyField) || null } : null;
}

const NAME_MESSAGES = {
  name: "Enter a name (up to 120 characters)",
  givenName: "Enter the given name (up to 120 characters)",
  familyName: "Up to 120 characters, or leave it empty",
} as const;

const GRADUATE_FIELDS = new Set(["name", "givenName", "familyName", "email"]);

function graduateErrors(issues: readonly Issue[]): FieldErrors {
  const errors = collectIssues(issues, (path) => (GRADUATE_FIELDS.has(String(path[0])) ? String(path[0]) : "form"));
  if (errors.name) errors.name = NAME_MESSAGES.name;
  if (errors.givenName) errors.givenName = NAME_MESSAGES.givenName;
  if (errors.familyName) errors.familyName = NAME_MESSAGES.familyName;
  if (errors.email) errors.email = "Enter a valid email address";
  return errors;
}

export function parseGraduateForm(form: FormData): ParseResult<CreateGraduateRequest> {
  const names = createNames(form, "givenName", "familyName");
  const parsed = createGraduateRequestSchema.safeParse({ name: text(form, "name"), ...names, email: text(form, "email") });
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, errors: graduateErrors(parsed.error.issues) };
}

const INVITATION_FIELDS: Record<string, string> = {
  guestName: "guestName",
  guestGivenName: "guestGivenName",
  guestFamilyName: "guestFamilyName",
  guestEmail: "guestEmail",
  guestPhone: "guestPhone",
  inviterUserIds: "inviterUserIds",
  maxPlusOnes: "maxPlusOnes",
};

function invitationErrors(issues: readonly Issue[]): FieldErrors {
  const errors = collectIssues(issues, (path) => INVITATION_FIELDS[String(path[0])] ?? "form");
  if (errors.guestName) errors.guestName = "Enter the guest's name";
  if (errors.guestGivenName) errors.guestGivenName = NAME_MESSAGES.givenName;
  if (errors.guestFamilyName) errors.guestFamilyName = NAME_MESSAGES.familyName;
  if (errors.guestEmail) errors.guestEmail = "Enter a valid email address, or leave it empty";
  if (errors.guestPhone) errors.guestPhone = "Up to 40 characters, or leave it empty";
  if (errors.inviterUserIds) errors.inviterUserIds = "Choose at least one graduate";
  if (errors.maxPlusOnes) errors.maxPlusOnes = "Enter a whole number, 0 or more";
  return errors;
}

export function parseInvitationForm(form: FormData): ParseResult<CreateInvitationRequest> {
  const maxPlusOnes = wholeNumber(text(form, "maxPlusOnes"));
  const inviterUserIds = form.getAll("inviterUserIds").filter((value): value is string => typeof value === "string");
  const names = createNames(form, "guestGivenName", "guestFamilyName");

  const parsed = createInvitationRequestSchema.safeParse({
    guestName: text(form, "guestName"),
    ...(names ? { guestGivenName: names.givenName, guestFamilyName: names.familyName } : {}),
    guestEmail: optionalText(form, "guestEmail"),
    guestPhone: optionalText(form, "guestPhone"),
    inviterUserIds,
    maxPlusOnes,
  });
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, errors: invitationErrors(parsed.error.issues) };
}

export { INITIAL_PREFIX };

export type EditParseResult<T> = { ok: true; id: string; data: T } | { ok: false; errors: FieldErrors };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The id hidden input of an edit or one-tap form, or null when it is not a UUID. */
export function formId(form: FormData, name = "id"): string | null {
  const id = form.get(name);
  return typeof id === "string" && UUID.test(id) ? id : null;
}

/** The fields whose (trimmed) value differs from their hidden `initial.*` copy. */
function changedFields(form: FormData, fields: readonly string[]): Set<string> {
  return new Set(fields.filter((field) => text(form, field) !== text(form, `${INITIAL_PREFIX}${field}`)));
}

interface NameFieldNames {
  name: string;
  given: string;
  family: string;
}

/**
 * The name part of an edit's PATCH body. Any change to the three name fields
 * sends all three: a full name alone would make the API re-split it and drop
 * the reviewed split. Saving an unchanged but unreviewed name confirms it,
 * since the admin has just looked at it.
 */
function nameChanges(form: FormData, fields: NameFieldNames, changed: Set<string>) {
  if (changed.has(fields.name) || changed.has(fields.given) || changed.has(fields.family)) {
    return {
      kind: "names" as const,
      name: text(form, fields.name),
      givenName: text(form, fields.given),
      familyName: text(form, fields.family) || null,
    };
  }
  return text(form, `${INITIAL_PREFIX}nameReviewed`) === "false" ? { kind: "confirm" as const } : null;
}

const NOTHING_CHANGED: FieldErrors = { form: "Nothing changed." };

/**
 * Graduate edit form → PATCH /admin/graduates/{id}: only what the admin
 * changed, so the audit row names real changes and a field someone else
 * edited meanwhile is left alone.
 */
export function parseGraduateEditForm(form: FormData): EditParseResult<UpdateGraduateRequest> {
  const id = formId(form);
  if (!id) return { ok: false, errors: { form: "Unknown graduate." } };
  const changed = changedFields(form, ["name", "givenName", "familyName", "email"]);
  const names = nameChanges(form, { name: "name", given: "givenName", family: "familyName" }, changed);

  const candidate: Record<string, unknown> = {};
  if (names?.kind === "names") Object.assign(candidate, { name: names.name, givenName: names.givenName, familyName: names.familyName });
  if (names?.kind === "confirm") candidate.nameReviewed = true;
  if (changed.has("email")) candidate.email = text(form, "email");
  if (Object.keys(candidate).length === 0) return { ok: false, errors: NOTHING_CHANGED };

  const parsed = updateGraduateRequestSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, id, data: parsed.data };
  return { ok: false, errors: graduateErrors(parsed.error.issues) };
}

/** Invitation edit form → PATCH /admin/invitations/{id}, with the same only-what-changed rule. */
export function parseInvitationEditForm(form: FormData): EditParseResult<UpdateInvitationRequest> {
  const id = formId(form);
  if (!id) return { ok: false, errors: { form: "Unknown invitation." } };
  const changed = changedFields(form, [
    "guestName",
    "guestGivenName",
    "guestFamilyName",
    "guestEmail",
    "guestPhone",
    "maxPlusOnes",
  ]);
  const names = nameChanges(form, { name: "guestName", given: "guestGivenName", family: "guestFamilyName" }, changed);

  const candidate: Record<string, unknown> = {};
  if (names?.kind === "names") {
    Object.assign(candidate, {
      guestName: names.name,
      guestGivenName: names.givenName,
      guestFamilyName: names.familyName,
    });
  }
  if (names?.kind === "confirm") candidate.nameReviewed = true;
  if (changed.has("guestEmail")) candidate.guestEmail = text(form, "guestEmail") || null;
  if (changed.has("guestPhone")) candidate.guestPhone = text(form, "guestPhone") || null;
  if (changed.has("maxPlusOnes")) candidate.maxPlusOnes = wholeNumber(text(form, "maxPlusOnes")) ?? Number.NaN;
  if (Object.keys(candidate).length === 0) return { ok: false, errors: NOTHING_CHANGED };

  const parsed = updateInvitationRequestSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, id, data: parsed.data };
  const errors = invitationErrors(parsed.error.issues);
  if (errors.maxPlusOnes) errors.maxPlusOnes = "Enter a whole number from 0 to 20";
  return { ok: false, errors };
}

const GUIDE_FIELDS = new Set(["title", "category", "description", "mapUrl", "timeHint", "sortOrder"]);

/**
 * Guide-book item form (#140), for both create and edit: every field is sent,
 * an empty map link or time hint as null. An unchecked "Shown to guests" box
 * deactivates the item.
 */
export function parseGuideItemForm(form: FormData): ParseResult<CreateGuideItemRequest> {
  const parsed = createGuideItemRequestSchema.safeParse({
    title: text(form, "title"),
    category: text(form, "category"),
    description: text(form, "description"),
    mapUrl: text(form, "mapUrl") || null,
    timeHint: text(form, "timeHint") || null,
    sortOrder: wholeNumber(text(form, "sortOrder")) ?? 0,
    active: form.get("active") === "on",
  });
  if (parsed.success) return { ok: true, data: parsed.data };

  const errors = collectIssues(parsed.error.issues, (path) =>
    GUIDE_FIELDS.has(String(path[0])) ? String(path[0]) : "form"
  );
  if (errors.title) errors.title = "Enter a title (up to 120 characters)";
  if (errors.category) errors.category = "Choose a category";
  if (errors.description) errors.description = "Up to 500 characters";
  if (errors.mapUrl) errors.mapUrl = "Enter a full map link starting with https://, or leave it empty";
  if (errors.timeHint) errors.timeHint = "Up to 80 characters, or leave it empty";
  if (errors.sortOrder) errors.sortOrder = "Enter a whole number from -10000 to 10000";
  return { ok: false, errors };
}

/**
 * Guide-book picks for one invitation. The "Use the defaults" button submits
 * `intent=defaults`, which clears the picks whatever is checked.
 */
export function parseGuidePicksForm(form: FormData): EditParseResult<{ itemIds: string[] }> {
  const id = formId(form, "invitationId");
  if (!id) return { ok: false, errors: { form: "Unknown invitation." } };
  if (form.get("intent") === "defaults") return { ok: true, id, data: { itemIds: [] } };
  const itemIds = [...new Set(form.getAll("itemIds").filter((value): value is string => typeof value === "string"))];
  if (itemIds.length > 100 || itemIds.some((itemId) => !UUID.test(itemId))) {
    return { ok: false, errors: { form: "Unknown guide item. Reload the page and try again." } };
  }
  return { ok: true, id, data: { itemIds } };
}

/** Maps a contract path (e.g. ["venue", "mapUrl"]) to the event form control name. */
function eventFieldFor(path: PropertyKey[]): string {
  const [head, child] = path.map(String);
  if (head === "venue") return `venue${capitalize(child ?? "name")}`;
  if (head === "contact") return `contact${capitalize(child ?? "name")}`;
  return head ?? "form";
}

/** Plain-language replacements for the schema's generic messages. */
const EVENT_MESSAGES: Record<string, string> = {
  name: "Enter the event name",
  endsAt: "The end must be after the start",
  venueName: "Enter the venue name",
  venueAddress: "Enter the venue address",
  venueMapUrl: "Enter a full map link, starting with https://",
  contactEmail: "Enter a valid email address, or leave it empty",
};

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Event form. `startsAt`/`endsAt` are datetime-local values interpreted in the
 * submitted `timeZone`. Contact is optional: all three contact fields empty
 * means `contact: null`; an email or phone without a name is an error.
 */
export function parseEventForm(form: FormData): ParseResult<UpdateEventRequest> {
  const errors: FieldErrors = {};
  const timeZone = text(form, "timeZone");
  const zoneOk = isValidTimeZone(timeZone);
  if (!zoneOk) errors.timeZone = "Enter an IANA time zone, e.g. Asia/Ho_Chi_Minh";

  const startsAtLocal = text(form, "startsAt");
  const endsAtLocal = text(form, "endsAt");
  const startsAt = zoneOk ? zonedLocalToIso(startsAtLocal, timeZone) : null;
  const endsAt = endsAtLocal && zoneOk ? zonedLocalToIso(endsAtLocal, timeZone) : null;
  if (zoneOk && !startsAt) errors.startsAt = "Enter a valid start date and time";
  if (zoneOk && endsAtLocal && !endsAt) errors.endsAt = "Enter a valid end date and time, or leave it empty";

  const contactName = text(form, "contactName");
  const contactEmail = text(form, "contactEmail");
  const contactPhone = text(form, "contactPhone");
  const hasContact = Boolean(contactName || contactEmail || contactPhone);
  if (hasContact && !contactName) errors.contactName = "Enter a contact name, or clear the contact fields";

  const candidate = {
    name: text(form, "name"),
    // Vietnamese versions (#9): empty means guests reading Vietnamese see the English field.
    nameVi: text(form, "nameVi") || null,
    startsAt: startsAt ?? "",
    endsAt: endsAtLocal ? (endsAt ?? "") : null,
    timeZone,
    timeConfirmed: form.get("timeConfirmed") === "on",
    venue: {
      name: text(form, "venueName"),
      address: text(form, "venueAddress"),
      addressVi: text(form, "venueAddressVi") || null,
      mapUrl: text(form, "venueMapUrl"),
    },
    contact: hasContact
      ? { name: contactName, email: contactEmail || null, phone: contactPhone || null }
      : null,
    arrivalInfo: text(form, "arrivalInfo") || null,
    arrivalInfoVi: text(form, "arrivalInfoVi") || null,
  };

  const parsed = updateEventRequestSchema.safeParse(candidate);
  if (!parsed.success) {
    // Messages already set above (clearer wording) take precedence over the schema's.
    const schemaErrors = collectIssues(parsed.error.issues, eventFieldFor);
    for (const [field, message] of Object.entries(schemaErrors)) errors[field] ??= EVENT_MESSAGES[field] ?? message;
  }
  if (Object.keys(errors).length > 0 || !parsed.success) return { ok: false, errors };
  return { ok: true, data: parsed.data };
}
