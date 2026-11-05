import {
  GRADUATE_SESSION_TTL_MS,
  type GraduateGuest,
  type GraduateInviteRequest,
  type GraduateMeResponse,
  type GraduateSessionResponse,
} from "@grad/contract";
import { generateToken, hashToken } from "../../auth/tokens.js";
import { JoinService, type GraduateInviteOutcome } from "../join/join.service.js";
import {
  GraduatePortalRepository,
  portalActor,
  type GraduatePortalStore,
  type PortalGraduate,
  type RemoveGuestOutcome,
  type StoredPortalGuest,
} from "./graduate-portal.repository.js";

function toGuest(stored: StoredPortalGuest): GraduateGuest {
  return {
    id: stored.id,
    name: stored.name,
    email: stored.email,
    status: stored.attending === null ? "pending" : stored.attending ? "attending" : "declined",
    answeredAt: stored.answeredAt?.toISOString() ?? null,
    soleInviter: stored.soleInviter,
  };
}

/**
 * The graduate portal (ADR-017). Nothing here logs: routes log ids and outcomes only. It never calls
 * `JoinService.rotate` or rotates an invitation: every link already shared keeps working.
 */
export class GraduatePortalService {
  constructor(
    private readonly store: GraduatePortalStore = new GraduatePortalRepository(),
    private readonly join: Pick<JoinService, "mailEnabled" | "joinUrlForGraduate" | "inviteForGraduate"> = new JoinService(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  get mailEnabled(): boolean {
    return this.join.mailEnabled;
  }

  /** Spends a sign-in token for a new session. Null for an unknown, used or expired token. */
  async signIn(signInToken: string): Promise<GraduateSessionResponse | null> {
    const now = this.now();
    const token = generateToken();
    const expiresAt = new Date(now.getTime() + GRADUATE_SESSION_TTL_MS);
    const graduateId = await this.store.signIn({
      signInHash: hashToken(signInToken),
      sessionHash: hashToken(token),
      sessionExpiresAt: expiresAt,
      now,
    });
    return graduateId ? { token, expiresAt: expiresAt.toISOString() } : null;
  }

  authenticate(sessionToken: string): Promise<PortalGraduate | null> {
    return this.store.findSession(hashToken(sessionToken), this.now());
  }

  signOut(graduate: PortalGraduate): Promise<void> {
    return this.store.revokeSession(graduate.sessionId, graduate.id, this.now());
  }

  async me(graduate: PortalGraduate): Promise<GraduateMeResponse> {
    return {
      graduate: { name: graduate.name, givenName: graduate.givenName },
      joinUrl: await this.join.joinUrlForGraduate(graduate),
    };
  }

  async listGuests(graduateId: string): Promise<GraduateGuest[]> {
    return (await this.store.listGuests(graduateId)).map(toGuest);
  }

  invite(graduateId: string, dto: GraduateInviteRequest): Promise<GraduateInviteOutcome> {
    return this.join.inviteForGraduate(graduateId, dto, portalActor(graduateId));
  }

  removeGuest(graduateId: string, invitationId: string): Promise<RemoveGuestOutcome | null> {
    return this.store.removeGuest(graduateId, invitationId);
  }
}
