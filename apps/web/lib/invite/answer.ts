import { INVITE_ANSWER_PARAM, INVITE_ANSWERS, type InviteAnswer } from "@grad/contract";

/** A known answer from an invitation link, or null for anything else (unknown, repeated, absent). */
export function parseInviteAnswer(value: unknown): InviteAnswer | null {
  return INVITE_ANSWERS.find((answer) => answer === value) ?? null;
}

/** Where the invitation lives; with an answer, the RSVP form opens with it pre-selected (ADR-016). */
export function inviteLocation(answer: InviteAnswer | null): string {
  return answer ? `/invite?${INVITE_ANSWER_PARAM}=${answer}` : "/invite";
}
