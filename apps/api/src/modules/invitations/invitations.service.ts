import crypto from "node:crypto";
import { config } from "../../config.js";
import { InvitationsRepository } from "./invitations.repository.js";
import type {
  CreateInvitationDTO,
  InvitationWithDetails,
} from "./invitations.types.js";

export class InvitationsService {
  constructor(
    private readonly repository: InvitationsRepository = new InvitationsRepository()
  ) {}

  /**
   * Generates a cryptographically secure 128-bit (16-byte) token encoded in base64url.
   */
  generateToken(): string {
    return crypto.randomBytes(16).toString("base64url");
  }

  /**
   * Hashes a raw token with SHA-256 for secure database storage.
   */
  hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  /**
   * Creates an invitation with a fresh 128-bit bearer token and returns the raw link once.
   */
  async issueInvitation(dto: CreateInvitationDTO): Promise<{
    invitationId: string;
    token: string;
    inviteUrl: string;
    guest: {
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
    };
    maxPlusOnes: number;
    inviterUserIds: string[];
  }> {
    const rawToken = this.generateToken();
    const tokenHash = this.hashToken(rawToken);

    const created = await this.repository.createInvitation(dto, tokenHash);

    return {
      invitationId: created.invitationId,
      token: rawToken,
      inviteUrl: `${config.publicOrigin}/invite/${rawToken}`,
      guest: created.guest,
      maxPlusOnes: created.maxPlusOnes,
      inviterUserIds: created.inviterUserIds,
    };
  }

  /**
   * Resolves an invitation by bearer token with constant-time verification.
   */
  async resolveByToken(token: string): Promise<InvitationWithDetails | null> {
    if (!token || typeof token !== "string") {
      return null;
    }

    const candidateHash = this.hashToken(token);
    const invitation = await this.repository.findByTokenHash(candidateHash);

    if (!invitation) {
      return null;
    }

    // Constant-time comparison to prevent side-channel timing attacks
    const candidateBuf = Buffer.from(candidateHash, "hex");
    const storedBuf = Buffer.from(invitation.token_hash, "hex");

    if (
      candidateBuf.length !== storedBuf.length ||
      !crypto.timingSafeEqual(candidateBuf, storedBuf)
    ) {
      return null;
    }

    if (invitation.status !== "active") {
      return null;
    }

    const { token_hash: _, ...safeInvitation } = invitation;
    return safeInvitation;
  }

  /**
   * Rotates the bearer token of an existing invitation.
   */
  async rotateInvitationToken(invitationId: string): Promise<{
    token: string;
    inviteUrl: string;
  } | null> {
    const rawToken = this.generateToken();
    const tokenHash = this.hashToken(rawToken);

    const updated = await this.repository.rotateTokenHash(invitationId, tokenHash);
    if (!updated) {
      return null;
    }

    return {
      token: rawToken,
      inviteUrl: `${config.publicOrigin}/invite/${rawToken}`,
    };
  }
}
