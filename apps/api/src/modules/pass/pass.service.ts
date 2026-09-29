import type { PassPayload, PassResponse } from "@grad/contract";
import type { InvitationsService } from "../invitations/invitations.service.js";
import type { PassSigner } from "./pass.signer.js";

export type PassResult =
  | { status: "ok"; pass: PassResponse }
  | { status: "invalid" }
  | { status: "expired" };

/**
 * Issues the signed pass for the invitation behind a bearer token. Token
 * handling is delegated to InvitationsService so both endpoints answer alike.
 */
export class PassService {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly signer: PassSigner,
  ) {}

  async passForToken(token: string): Promise<PassResult> {
    const result = await this.invitations.resolveByToken(token);
    if (result.status !== "ok") return result;

    const { invitation } = result;
    // Built field by field: the payload must never pick up email, phone, token or hash.
    const payload: PassPayload = {
      v: 1,
      invitationId: invitation.id,
      guestName: invitation.guest.name,
      validFrom: invitation.validFrom,
      validUntil: invitation.validUntil,
    };
    return { status: "ok", pass: this.signer.sign(payload) };
  }
}
