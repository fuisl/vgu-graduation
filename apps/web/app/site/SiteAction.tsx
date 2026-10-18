import {Cta} from "@grad/ui";

/**
 * The signed-out guest chip. GuestChip (#146) shows it until /api/me reports a signed-in guest.
 * It links to /me, which explains how to open an invitation when there is none on this device (#139).
 */
export function SignedOutChip() {
  return <Cta tone="on-blue" href="/me">Guest portal</Cta>;
}
