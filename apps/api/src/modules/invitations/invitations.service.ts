import type {
  AdminInvitationsResponse,
  CreateInvitationRequest,
  CreateInvitationResponse,
  EmailStatus,
  Invitation,
  RevokeInvitationResponse,
  RotateInvitationResponse,
  UpdateInvitationRequest,
  UpdateInvitationResponse,
} from "@grad/contract";
import { generateToken, hashToken, safeEqual } from "../../auth/tokens.js";
import { config } from "../../config.js";
import { MailService } from "../mail/mail.service.js";
import { InvitationsRepository, type StoredInvitation } from "./invitations.repository.js";

/**
 * `invalid` covers unknown, revoked and not-yet-valid credentials alike, so a
 * caller can't probe which tokens exist. Only `expired` is distinguishable
 * (410) so the web app can tell a guest their invitation has run out.
 */
export type ResolveResult =
  | { status: "ok"; invitation: Invitation }
  | { status: "invalid" }
  | { status: "expired" };

function toContract(stored: StoredInvitation): Invitation {
  return {
    id: stored.id,
    guest: stored.guest,
    maxPlusOnes: stored.maxPlusOnes,
    status: stored.status,
    validFrom: stored.validFrom?.toISOString() ?? null,
    validUntil: stored.validUntil?.toISOString() ?? null,
    inviters: stored.inviters,
    rsvp: stored.rsvp && { ...stored.rsvp, updatedAt: stored.rsvp.updatedAt.toISOString() },
  };
}

export class InvitationsService {
  constructor(
    private readonly repository: InvitationsRepository = new InvitationsRepository(),
    private readonly now: () => Date = () => new Date(),
    private readonly mail: Pick<MailService, "sendInvitation"> = new MailService(),
  ) {}

  /**
   * Creates an invitation with a fresh 128-bit bearer token and returns the raw link once.
   * With `sendEmail`, also mails the link to the guest (ADR-012); the invitation is created
   * and the link returned whatever the email does.
   */
  async issueInvitation(
    dto: CreateInvitationRequest,
    actor: string,
  ): Promise<CreateInvitationResponse> {
    const token = generateToken();
    const created = await this.repository.createInvitation(dto, hashToken(token), actor);
    const inviteUrl = `${config.publicOrigin}/invite/${token}`;
    const emailStatus = dto.sendEmail
      ? await this.mail.sendInvitation({
          to: created.guest.email,
          givenName: created.guest.givenName,
          inviteUrl,
          invitationId: created.invitationId,
          guestName: created.guest.name,
        })
      : undefined;

    return {
      invitationId: created.invitationId,
      token,
      inviteUrl,
      guest: created.guest,
      maxPlusOnes: created.maxPlusOnes,
      inviterUserIds: created.inviterUserIds,
      ...(emailStatus ? { emailStatus } : {}),
    };
  }

  /** Resolves an invitation by bearer token, rejecting wrong, revoked and not-yet-valid ones and flagging expired ones. */
  async resolveByToken(token: string): Promise<ResolveResult> {
    if (!token) return { status: "invalid" };

    const candidateHash = hashToken(token);
    const stored = await this.repository.findByTokenHash(candidateHash);
    if (!stored || !safeEqual(candidateHash, stored.tokenHash)) return { status: "invalid" };
    if (stored.status !== "active") return { status: "invalid" };

    const now = this.now();
    if (stored.validFrom && stored.validFrom > now) return { status: "invalid" };
    if (stored.validUntil && stored.validUntil <= now) return { status: "expired" };

    return { status: "ok", invitation: toContract(stored) };
  }

  /** Rotates the bearer token of an existing invitation, optionally emailing the new link to the guest. */
  async rotateInvitationToken(
    invitationId: string,
    actor: string,
    options: { sendEmail?: boolean } = {},
  ): Promise<RotateInvitationResponse | null> {
    const token = generateToken();
    const updated = await this.repository.rotateTokenHash(invitationId, hashToken(token), actor);
    if (!updated) return null;

    const inviteUrl = `${config.publicOrigin}/invite/${token}`;
    if (!options.sendEmail) return { token, inviteUrl };
    return { token, inviteUrl, emailStatus: await this.emailGuest(invitationId, inviteUrl) };
  }

  private async emailGuest(invitationId: string, inviteUrl: string): Promise<EmailStatus> {
    const [row] = await this.repository.listForAdmin(invitationId);
    if (!row) return "failed";
    return this.mail.sendInvitation({
      to: row.guest.email,
      givenName: row.guest.givenName ?? row.guest.name,
      inviteUrl,
      invitationId,
      guestName: row.guest.name,
    });
  }

  /** Revokes an invitation (idempotent); null when the id is unknown. */
  async revokeInvitation(invitationId: string, actor: string): Promise<RevokeInvitationResponse | null> {
    const revoked = await this.repository.revoke(invitationId, actor);
    if (!revoked) return null;
    return { id: revoked.id, status: "revoked", revokedAt: revoked.revokedAt.toISOString() };
  }

  async listInvitations(): Promise<AdminInvitationsResponse> {
    return { items: await this.repository.listForAdmin() };
  }

  /**
   * PATCH /admin/invitations/{id}; null when the id is unknown. Throws
   * PlusOnesConflictError when `maxPlusOnes` drops below the RSVP's plus-ones.
   */
  async updateInvitation(
    invitationId: string,
    dto: UpdateInvitationRequest,
    actor: string,
  ): Promise<UpdateInvitationResponse | null> {
    return this.repository.update(invitationId, dto, actor);
  }
}
