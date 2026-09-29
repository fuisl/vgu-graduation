import type {
  AdminInvitationsResponse,
  CreateInvitationRequest,
  CreateInvitationResponse,
  Invitation,
  RevokeInvitationResponse,
  RotateInvitationResponse,
} from "@grad/contract";
import { generateToken, hashToken, safeEqual } from "../../auth/tokens.js";
import { config } from "../../config.js";
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
  ) {}

  /** Creates an invitation with a fresh 128-bit bearer token and returns the raw link once. */
  async issueInvitation(
    dto: CreateInvitationRequest,
    actor: string,
  ): Promise<CreateInvitationResponse> {
    const token = generateToken();
    const created = await this.repository.createInvitation(dto, hashToken(token), actor);

    return {
      invitationId: created.invitationId,
      token,
      inviteUrl: `${config.publicOrigin}/invite/${token}`,
      guest: created.guest,
      maxPlusOnes: created.maxPlusOnes,
      inviterUserIds: created.inviterUserIds,
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

  /** Rotates the bearer token of an existing invitation. */
  async rotateInvitationToken(
    invitationId: string,
    actor: string,
  ): Promise<RotateInvitationResponse | null> {
    const token = generateToken();
    const updated = await this.repository.rotateTokenHash(invitationId, hashToken(token), actor);
    if (!updated) return null;

    return { token, inviteUrl: `${config.publicOrigin}/invite/${token}` };
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
}
