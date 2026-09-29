import {
  createGraduateRequestSchema,
  createInvitationRequestSchema,
  updateEventRequestSchema,
  type CreateGraduateRequest,
  type CreateInvitationRequest,
  type UpdateEventRequest,
} from "@grad/contract";
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

export function parseGraduateForm(form: FormData): ParseResult<CreateGraduateRequest> {
  const parsed = createGraduateRequestSchema.safeParse({ name: text(form, "name"), email: text(form, "email") });
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors = collectIssues(parsed.error.issues, (path) => (path[0] === "email" ? "email" : "name"));
  if (errors.name) errors.name = "Enter a name (up to 120 characters)";
  if (errors.email) errors.email = "Enter a valid email address";
  return { ok: false, errors };
}

const INVITATION_FIELDS: Record<string, string> = {
  guestName: "guestName",
  guestEmail: "guestEmail",
  guestPhone: "guestPhone",
  inviterUserIds: "inviterUserIds",
  maxPlusOnes: "maxPlusOnes",
};

export function parseInvitationForm(form: FormData): ParseResult<CreateInvitationRequest> {
  const rawPlusOnes = text(form, "maxPlusOnes");
  const maxPlusOnes = rawPlusOnes === "" ? undefined : Number(rawPlusOnes);
  const inviterUserIds = form.getAll("inviterUserIds").filter((value): value is string => typeof value === "string");

  const parsed = createInvitationRequestSchema.safeParse({
    guestName: text(form, "guestName"),
    guestEmail: optionalText(form, "guestEmail"),
    guestPhone: optionalText(form, "guestPhone"),
    inviterUserIds,
    maxPlusOnes,
  });
  if (parsed.success) return { ok: true, data: parsed.data };

  const errors = collectIssues(parsed.error.issues, (path) => INVITATION_FIELDS[String(path[0])] ?? "form");
  if (errors.guestName) errors.guestName = "Enter the guest's name";
  if (errors.guestEmail) errors.guestEmail = "Enter a valid email address, or leave it empty";
  if (errors.inviterUserIds) errors.inviterUserIds = "Choose at least one graduate";
  if (errors.maxPlusOnes) errors.maxPlusOnes = "Enter a whole number, 0 or more";
  return { ok: false, errors };
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
    startsAt: startsAt ?? "",
    endsAt: endsAtLocal ? (endsAt ?? "") : null,
    timeZone,
    timeConfirmed: form.get("timeConfirmed") === "on",
    venue: {
      name: text(form, "venueName"),
      address: text(form, "venueAddress"),
      mapUrl: text(form, "venueMapUrl"),
    },
    contact: hasContact
      ? { name: contactName, email: contactEmail || null, phone: contactPhone || null }
      : null,
    arrivalInfo: text(form, "arrivalInfo") || null,
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
