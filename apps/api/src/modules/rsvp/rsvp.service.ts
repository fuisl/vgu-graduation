import {
  ACCESSIBILITY_NEED_KEYS,
  type AccessibilitySummary,
  type AdminAccessibilityResponse,
  type AdminRsvpListResponse,
  type GuestRsvp,
  type PutRsvpRequest,
  type PutRsvpResponse,
} from "@grad/contract";
import { InvitationsService } from "../invitations/invitations.service.js";
import { RsvpRepository, type StoredGuestRsvp, type StoredRsvp } from "./rsvp.repository.js";

export type PutRsvpResult =
  | { status: "ok"; rsvp: PutRsvpResponse }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "over_limit"; maxPlusOnes: number };

export type GetRsvpResult = { status: "ok"; rsvp: GuestRsvp | null } | { status: "invalid" } | { status: "expired" };

function toContract(stored: StoredRsvp): PutRsvpResponse {
  return { ...stored, updatedAt: stored.updatedAt.toISOString() };
}

function toGuestRsvp(stored: StoredGuestRsvp): GuestRsvp {
  return { ...stored, updatedAt: stored.updatedAt.toISOString() };
}

type Repository = Pick<RsvpRepository, "upsert" | "listAll" | "findForInvitation" | "listAccessibility">;

export class RsvpService {
  constructor(
    private readonly invitations: Pick<InvitationsService, "resolveByToken"> = new InvitationsService(),
    private readonly repository: Repository = new RsvpRepository(),
  ) {}

  /**
   * Creates or replaces the RSVP of the invitation behind `token`. No deadline:
   * editable until the event. Accessibility needs follow `putRsvpRequestSchema`.
   */
  async putByToken(token: string, dto: PutRsvpRequest): Promise<PutRsvpResult> {
    const resolved = await this.invitations.resolveByToken(token);
    if (resolved.status !== "ok") return { status: resolved.status };

    const { id, maxPlusOnes } = resolved.invitation;
    if (dto.plusOnesCount > maxPlusOnes) return { status: "over_limit", maxPlusOnes };

    return { status: "ok", rsvp: toGuestRsvp(await this.repository.upsert(id, dto)) };
  }

  /** GET /rsvp: the guest's own answer and accessibility needs, never anyone else's. */
  async getByToken(token: string): Promise<GetRsvpResult> {
    const resolved = await this.invitations.resolveByToken(token);
    if (resolved.status !== "ok") return { status: resolved.status };
    const stored = await this.repository.findForInvitation(resolved.invitation.id);
    return { status: "ok", rsvp: stored && toGuestRsvp(stored) };
  }

  async listAll(): Promise<AdminRsvpListResponse> {
    const rows = await this.repository.listAll();
    return {
      items: rows.map((r) => ({ ...r, rsvp: r.rsvp && toContract(r.rsvp) })),
    };
  }

  /** GET /admin/rsvp/accessibility: who needs what, and counts over attending guests. */
  async listAccessibility(): Promise<AdminAccessibilityResponse> {
    const rows = await this.repository.listAccessibility();
    const needs = Object.fromEntries(ACCESSIBILITY_NEED_KEYS.map((key) => [key, 0])) as AccessibilitySummary["needs"];
    const summary: AccessibilitySummary = { guests: 0, withNote: 0, needs };
    for (const row of rows) {
      if (!row.attending) continue;
      summary.guests += 1;
      if (row.accessibility.note) summary.withNote += 1;
      for (const key of ACCESSIBILITY_NEED_KEYS) if (row.accessibility[key]) needs[key] += 1;
    }
    return {
      summary,
      items: rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })),
    };
  }
}
