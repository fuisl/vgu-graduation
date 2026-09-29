import type { AdminRsvpListResponse, PutRsvpRequest, PutRsvpResponse } from "@grad/contract";
import { InvitationsService } from "../invitations/invitations.service.js";
import { RsvpRepository, type StoredRsvp } from "./rsvp.repository.js";

export type PutRsvpResult =
  | { status: "ok"; rsvp: PutRsvpResponse }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "over_limit"; maxPlusOnes: number };

function toContract(stored: StoredRsvp): PutRsvpResponse {
  return { ...stored, updatedAt: stored.updatedAt.toISOString() };
}

export class RsvpService {
  constructor(
    private readonly invitations: Pick<InvitationsService, "resolveByToken"> = new InvitationsService(),
    private readonly repository: Pick<RsvpRepository, "upsert" | "listAll"> = new RsvpRepository(),
  ) {}

  /** Creates or replaces the RSVP of the invitation behind `token`. No deadline: editable until the event. */
  async putByToken(token: string, dto: PutRsvpRequest): Promise<PutRsvpResult> {
    const resolved = await this.invitations.resolveByToken(token);
    if (resolved.status !== "ok") return { status: resolved.status };

    const { id, maxPlusOnes } = resolved.invitation;
    if (dto.plusOnesCount > maxPlusOnes) return { status: "over_limit", maxPlusOnes };

    return { status: "ok", rsvp: toContract(await this.repository.upsert(id, dto)) };
  }

  async listAll(): Promise<AdminRsvpListResponse> {
    const rows = await this.repository.listAll();
    return {
      items: rows.map((r) => ({ ...r, rsvp: r.rsvp && toContract(r.rsvp) })),
    };
  }
}
