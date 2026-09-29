import type { PutRsvpRequest, Rsvp } from "@grad/contract";
import type { ApiResult } from "../api/result";

export type RsvpFormState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; kind: "invalid" | "rejected" | "gone" | "retry"; message: string };

export const IDLE: RsvpFormState = { status: "idle" };

export const RETRY_MESSAGE = "We could not save your RSVP. Your answers are still here; please try again.";

export const NO_TOKEN_STATE: RsvpFormState = {
  status: "error",
  kind: "gone",
  message: "This invitation link is no longer active. Please contact an organizer.",
};

type Parsed = { ok: true; request: PutRsvpRequest } | { ok: false; state: RsvpFormState };

function invalid(message: string): Parsed {
  return { ok: false, state: { status: "error", kind: "invalid", message } };
}

/** Turns submitted form fields into a PUT /rsvp body, or an error state. Pure. */
export function parseRsvpForm(fields: { get(name: string): unknown }, maxPlusOnes: number): Parsed {
  const attendingRaw = fields.get("attending");
  if (attendingRaw !== "yes" && attendingRaw !== "no") return invalid("Please choose whether you are attending.");
  const attending = attendingRaw === "yes";

  let plusOnesCount = 0;
  if (attending && maxPlusOnes > 0) {
    const raw = String(fields.get("plusOnesCount") ?? "0").trim();
    plusOnesCount = raw === "" ? 0 : Number(raw);
    if (!Number.isInteger(plusOnesCount) || plusOnesCount < 0 || plusOnesCount > maxPlusOnes) {
      return invalid(`Guests must be a whole number from 0 to ${maxPlusOnes}.`);
    }
  }

  const dietary = String(fields.get("dietaryRequirements") ?? "").trim();
  if (dietary.length > 500) return invalid("Dietary requirements must be at most 500 characters.");
  const notes = String(fields.get("notes") ?? "").trim();
  if (notes.length > 1000) return invalid("Notes must be at most 1000 characters.");

  return {
    ok: true,
    request: {
      attending,
      plusOnesCount,
      dietaryRequirements: attending ? dietary || null : null,
      notes: notes || null,
    },
  };
}

/** Maps the API result to what the guest sees. Pure. */
export function mapRsvpResult(result: ApiResult<Rsvp>): RsvpFormState {
  if (result.status === "ok") {
    return {
      status: "success",
      message: result.data.attending
        ? "Thank you, your RSVP is saved: you are attending."
        : "Thank you, your RSVP is saved: you cannot attend.",
    };
  }
  if (result.status === "empty") return NO_TOKEN_STATE;
  if (result.kind === "http" && result.httpStatus === 400) {
    return { status: "error", kind: "rejected", message: result.message };
  }
  if (result.kind === "http" && (result.httpStatus === 401 || result.httpStatus === 404 || result.httpStatus === 410)) {
    return {
      status: "error",
      kind: "gone",
      message:
        result.httpStatus === 410
          ? "This invitation has expired, so your RSVP could not be saved. Please contact an organizer."
          : "This invitation is no longer valid, so your RSVP could not be saved. Please contact an organizer.",
    };
  }
  return { status: "error", kind: "retry", message: RETRY_MESSAGE };
}
