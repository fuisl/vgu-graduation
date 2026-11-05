import { GRADUATE_SIGN_IN_TTL_MS } from "@grad/contract";
import { generateToken, hashToken } from "../../auth/tokens.js";
import { GraduatePortalRepository, type GraduatePortalStore } from "./graduate-portal.repository.js";

/**
 * Issues sign-in tokens for the email JoinService sends (ADR-017). Separate from the portal service
 * so the join module depends on this small piece only. Returns the raw token, which is never stored.
 */
export class GraduateSignInIssuer {
  constructor(
    private readonly store: Pick<GraduatePortalStore, "issueSignInToken"> = new GraduatePortalRepository(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async issue(graduateId: string): Promise<string> {
    const token = generateToken();
    const now = this.now();
    await this.store.issueSignInToken({
      graduateId,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + GRADUATE_SIGN_IN_TTL_MS),
      now,
    });
    return token;
  }
}
