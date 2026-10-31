import crypto from "node:crypto";
import type { EmailStatus, JoinInfo, JoinLinkRequest, JoinRequest } from "@grad/contract";
import { generateToken, hashToken } from "../../auth/tokens.js";
import { config } from "../../config.js";
import { MailService } from "../mail/mail.service.js";
import { JoinRepository, type JoinStore } from "./join.repository.js";

/** A join code: 64-bit random, base64url. Shared widely, so shorter than an invitation token. */
export function generateJoinCode(): string {
  return crypto.randomBytes(8).toString("base64url");
}

/** The public join link for a code. */
export function joinUrlFor(code: string, publicOrigin: string = config.publicOrigin): string {
  return `${publicOrigin}/join/${code}`;
}

/** How a join link request went. `not_graduate` is never shown to the requester (the route answers 202 either way). */
export type JoinLinkOutcome = EmailStatus | "not_graduate";

export type RegisterOutcome = "registered" | "unknown_code" | "send_failed" | "not_configured";

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
   * so copies the graduate already shared keep working; only an admin rotation replaces it.
   */
  async requestLink(dto: JoinLinkRequest): Promise<JoinLinkOutcome> {
    const graduate = await this.store.findGraduateByEmail(dto.email);
    if (!graduate) return "not_graduate";
    const code = graduate.joinCode ?? (await this.store.ensureJoinCode(graduate.id, this.newCode()));
    return this.mail.sendJoinLink({
      to: graduate.email,
      givenName: graduate.givenName,
      locale: dto.locale,
      joinUrl: joinUrlFor(code, this.publicOrigin),
    });
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
    if (!this.mail.enabled) return "not_configured";

    const token = generateToken();
    const result = await this.store.register({
      graduateId: graduate.id,
      name: dto.name,
      email: dto.email,
      tokenHash: hashToken(token),
    });
    if (result.kind === "existing") return "registered";

    const status = await this.mail.sendInvitation({
      to: dto.email,
      givenName: result.givenName,
      inviteUrl: `${this.publicOrigin}/invite/${token}`,
      invitationId: result.invitationId,
      guestName: dto.name,
    });
    if (status === "sent") return "registered";

    await this.store.discard({ invitationId: result.invitationId, guestId: result.guestId, graduateId: graduate.id });
    return status === "not_configured" ? "not_configured" : "send_failed";
  }

  /** POST /admin/graduates/{id}/join-link: a fresh link; the old one stops working. Null for an unknown graduate. */
  async rotate(graduateId: string, actor: string): Promise<string | null> {
    const code = this.newCode();
    return (await this.store.rotateJoinCode(graduateId, code, actor)) ? joinUrlFor(code, this.publicOrigin) : null;
  }
}
