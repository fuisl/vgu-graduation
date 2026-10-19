import type { PutRsvpRequest, Rsvp } from "@grad/contract";
import type { ApiResult } from "../api/result";
import type { I18n } from "../i18n/dictionary";
import type { MessageSlice } from "../i18n/format";
import { parseAccessibilityFields } from "./accessibility";

/** What the RSVP helpers need from the page's I18n (#9): the server action passes its own. */
type Copy = Pick<I18n, "t" | "locale">;

/** The message prefixes the client RSVP form and its accessibility section render (`pickMessages(locale, ...RSVP_MESSAGES)`). */
export const RSVP_MESSAGES = ["rsvp.form.", "rsvp.a11y.", "rsvp.error.retry"] as const;
export type RsvpMessages = MessageSlice<(typeof RSVP_MESSAGES)[number]>;

export type RsvpFormState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; kind: "invalid" | "rejected" | "gone" | "retry"; message: string };

export const IDLE: RsvpFormState = { status: "idle" };

export function noTokenState({ t }: Pick<Copy, "t">): RsvpFormState {
  return { status: "error", kind: "gone", message: t("rsvp.error.noToken") };
}

type Parsed = { ok: true; request: PutRsvpRequest } | { ok: false; state: RsvpFormState };

function invalid(message: string): Parsed {
  return { ok: false, state: { status: "error", kind: "invalid", message } };
}

/** Turns submitted form fields into a PUT /rsvp body, or an error state. Pure. */
export function parseRsvpForm(fields: { get(name: string): unknown }, maxPlusOnes: number, { t }: Pick<Copy, "t">): Parsed {
  const attendingRaw = fields.get("attending");
  if (attendingRaw !== "yes" && attendingRaw !== "no") return invalid(t("rsvp.error.attending"));
  const attending = attendingRaw === "yes";

  let plusOnesCount = 0;
  if (attending && maxPlusOnes > 0) {
    const raw = String(fields.get("plusOnesCount") ?? "0").trim();
    plusOnesCount = raw === "" ? 0 : Number(raw);
    if (!Number.isInteger(plusOnesCount) || plusOnesCount < 0 || plusOnesCount > maxPlusOnes) {
      return invalid(t("rsvp.error.plusOnes", { max: maxPlusOnes }));
    }
  }

  const dietary = String(fields.get("dietaryRequirements") ?? "").trim();
  if (dietary.length > 500) return invalid(t("rsvp.error.dietaryLength", { max: 500 }));
  const notes = String(fields.get("notes") ?? "").trim();
  if (notes.length > 1000) return invalid(t("rsvp.error.notesLength", { max: 1000 }));

  const needs = parseAccessibilityFields(fields, { t });
  if (!needs.ok) return invalid(needs.message);

  const request: PutRsvpRequest = {
    attending,
    plusOnesCount,
    dietaryRequirements: attending ? dietary || null : null,
    notes: notes || null,
  };
  // Omitted (not null) unless the guest changed the section: PUT /rsvp then keeps what is stored.
  if (needs.accessibility !== undefined) request.accessibility = needs.accessibility;
  return { ok: true, request };
}

/** Maps the API result to what the guest sees. Pure. */
export function mapRsvpResult(result: ApiResult<Rsvp>, { t, locale }: Copy): RsvpFormState {
  if (result.status === "ok") {
    return {
      status: "success",
      message: result.data.attending ? t("rsvp.saved.attending") : t("rsvp.saved.declined"),
    };
  }
  if (result.status === "empty") return noTokenState({ t });
  if (result.kind === "http" && result.httpStatus === 400) {
    // The API explains a rejected answer in English; Vietnamese readers get a general line instead.
    return { status: "error", kind: "rejected", message: locale === "en" ? result.message : t("rsvp.error.rejected") };
  }
  if (result.kind === "http" && (result.httpStatus === 401 || result.httpStatus === 404 || result.httpStatus === 410)) {
    return {
      status: "error",
      kind: "gone",
      message: result.httpStatus === 410 ? t("rsvp.error.expired") : t("rsvp.error.invalid"),
    };
  }
  return { status: "error", kind: "retry", message: t("rsvp.error.retry") };
}
