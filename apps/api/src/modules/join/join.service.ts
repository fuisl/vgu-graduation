import crypto from "node:crypto";
import type { EmailStatus, GraduateInviteRequest, JoinInfo, JoinLinkRequest, JoinRequest } from "@grad/contract";
import { generateToken, hashToken } from "../../auth/tokens.js";
import { config } from "../../config.js";
import { MailService } from "../mail/mail.service.js";
import { GraduateSignInIssuer } from "../graduate-portal/sign-in-issuer.js";
import { JoinRepository, type JoinStore } from "./join.repository.js";

/** A join code: 64-bit random, base64url. Shared widely, so shorter than an invitation token. */
export function generateJoinCode(): string {
  return crypto.randomBytes(8).toString("base64url");
}

/** The public join link for a code. */
export function joinUrlFor(code: string, publicOrigin: string = config.publicOrigin): string {
  return `${publicOrigin}/join/${code}`;
}

/** The portal's sign-in link for a token (ADR-017). Opening it spends nothing: the web app asks for a confirmation first. */
export function signInUrlFor(token: string, publicOrigin: string = config.publicOrigin): string {
  return `${publicOrigin}/graduate/sign-in/${token}`;
}

/** How a join link request went. `not_graduate` is never shown to the requester (the route answers 202 either way). */
export type JoinLinkOutcome = EmailStatus | "not_graduate";

export type RegisterOutcome = "registered" | "unknown_code" | "send_failed" | "not_configured";

/** How a graduate's invite from the portal went (ADR-017): unlike the join form, they are told whether an email went. */
export type GraduateInviteOutcome = "invited" | "already_invited" | "send_failed" | "not_configured";

/**
 * Guest self-registration (ADR-015). A graduate gets one join link by email; their guests register
 * through it and are invited at once. Nothing here logs: routes log ids and outcomes only.
 */
export class JoinService {
  constructor(
    private readonly store: JoinStore = new JoinRepository(),
    private readonly mail: Pick<MailService, "enabled" | "sendInvitation" | "sendJoinLink"> = new MailService(),
    private readonly publicOrigin: string = config.publicOrigin,
    private readonly newCode: () => string = generateJoinCode,
    private readonly signIn: Pick<GraduateSignInIssuer, "issue"> = new GraduateSignInIssuer(),
  ) {}

  get mailEnabled(): boolean {
    return this.mail.enabled;
  }

  /** GET /join/{code}: the graduate's name, or null for an unknown code. */
  async info(code: string): Promise<JoinInfo | null> {
    const graduate = await this.store.findGraduateByCode(code);
    return graduate ? { graduate: { name: graduate.name, givenName: graduate.givenName } } : null;
  }

  /**
   * Emails a graduate their join link, issuing it on the first request. The same link every time,
   * so copies the graduate already shared keep working; only an admin rotation replaces it. The email
   * also carries a fresh sign-in link for their dashboard (ADR-017); the join code never signs anyone in.
   */
  async requestLink(dto: JoinLinkRequest): Promise<JoinLinkOutcome> {
    const graduate = await this.store.findGraduateByEmail(dto.email);
    if (!graduate) return "not_graduate";
    const joinUrl = await this.joinUrlForGraduate(graduate);
    const signInToken = await this.signIn.issue(graduate.id);
    return this.mail.sendJoinLink({
      to: graduate.email,
      givenName: graduate.givenName,
      locale: dto.locale,
      joinUrl,
      dashboardUrl: signInUrlFor(signInToken, this.publicOrigin),
    });
  }

  /** A graduate's join link, issuing it if they have none yet. An existing code is never replaced. */
  async joinUrlForGraduate(graduate: { id: string; joinCode: string | null }): Promise<string> {
    const code = graduate.joinCode ?? (await this.store.ensureJoinCode(graduate.id, this.newCode()));
    return joinUrlFor(code, this.publicOrigin);
  }

  /**
   * POST /join/{code}. A new guest gets an invitation and its link by email; an address that is
   * already invited gets this graduate as a co-inviter and no email. A filled honeypot is answered
   * like a success and dropped.
   */
  async register(code: string, dto: JoinRequest): Promise<RegisterOutcome> {
    const graduate = await this.store.findGraduateByCode(code);
    if (!graduate) return "unknown_code";
    if (dto.website) return "registered";
    const outcome = await this.inviteForGraduate(graduate.id, dto);
    return outcome === "invited" || outcome === "already_invited" ? "registered" : outcome;
  }

  /**
   * The registration itself, for a graduate already known: through their join link, or signed in to
   * the portal with `actor` naming them in the audit (ADR-017). A new guest gets an invitation by
   * email; an address that is already invited gets this graduate as a co-inviter and no email. If
   * the email can't be sent, nothing is kept.
   */
  async inviteForGraduate(graduateId: string, dto: GraduateInviteRequest, actor?: string): Promise<GraduateInviteOutcome> {
    if (!this.mail.enabled) return "not_configured";

    const token = generateToken();
    const result = await this.store.register({
      graduateId,
      name: dto.name,
      email: dto.email,
      tokenHash: hashToken(token),
      ...(actor ? { actor } : {}),
    });
    if (result.kind === "existing") return "already_invited";

    const status = await this.mail.sendInvitation({
      to: dto.email,
      givenName: result.givenName,
      inviteUrl: `${this.publicOrigin}/invite/${token}`,
      invitationId: result.invitationId,
      guestName: dto.name,
    });
    if (status === "sent") return "invited";

    await this.store.discard({ invitationId: result.invitationId, guestId: result.guestId, graduateId, ...(actor ? { actor } : {}) });
    return status === "not_configured" ? "not_configured" : "send_failed";
  }

  /** POST /admin/graduates/{id}/join-link: a fresh link; the old one stops working. Null for an unknown graduate. */
  async rotate(graduateId: string, actor: string): Promise<string | null> {
    const code = this.newCode();
    return (await this.store.rotateJoinCode(graduateId, code, actor)) ? joinUrlFor(code, this.publicOrigin) : null;
  }
}
