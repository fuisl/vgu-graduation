import {Cta} from "@grad/ui";

/**
 * Default right-hand nav action: the signed-out guest chip.
 * #146 replaces this with a chip that also has a signed-in state; pass it to
 * SiteHeader through the `action` prop, or swap this default.
 */
export function SignedOutChip() {
  return <Cta tone="on-blue" href="/invite">Your invitation</Cta>;
}
