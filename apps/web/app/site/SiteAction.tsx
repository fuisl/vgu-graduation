import {Cta} from "@grad/ui";

/** The signed-out guest chip. GuestChip (#146) shows it until /api/me reports a signed-in guest. */
export function SignedOutChip() {
  return <Cta tone="on-blue" href="/invite">Your invitation</Cta>;
}
