import type {
  AdminGuideItem,
  AdminGuideItemsResponse,
  AdminInvitationGuideResponse,
  CreateGuideItemRequest,
  GuestGuideResponse,
  GuideItem,
  UpdateGuideItemRequest,
} from "@grad/contract";
import { InvitationsService } from "../invitations/invitations.service.js";
import { GuideRepository, type StoredGuideItem } from "./guide.repository.js";

export type GuestGuideResult = { status: "ok"; guide: GuestGuideResponse } | { status: "invalid" } | { status: "expired" };

export type SetGuideResult =
  | { status: "ok"; guide: AdminInvitationGuideResponse }
  | { status: "not_found" }
  | { status: "unknown_items" };

function toGuideItem(item: StoredGuideItem): GuideItem {
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    description: item.description,
    mapUrl: item.mapUrl,
    timeHint: item.timeHint,
    sortOrder: item.sortOrder,
  };
}

function toAdminGuideItem(item: StoredGuideItem): AdminGuideItem {
  return {
    ...toGuideItem(item),
    active: item.active,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

type Repository = Pick<
  GuideRepository,
  "listItems" | "createItem" | "updateItem" | "deleteItem" | "selection" | "setSelection" | "selectedActiveItems"
>;

/** Guest guide-book (#140). */
export class GuideService {
  constructor(
    private readonly invitations: Pick<InvitationsService, "resolveByToken"> = new InvitationsService(),
    private readonly repository: Repository = new GuideRepository(),
  ) {}

  /** GET /invitations/me/guide: the picks for this invitation, or the defaults when none are active. */
  async guideByToken(token: string): Promise<GuestGuideResult> {
    const resolved = await this.invitations.resolveByToken(token);
    if (resolved.status !== "ok") return { status: resolved.status };
    return { status: "ok", guide: await this.effectiveGuide(resolved.invitation.id) };
  }

  async listItems(): Promise<AdminGuideItemsResponse> {
    return { items: (await this.repository.listItems({ activeOnly: false })).map(toAdminGuideItem) };
  }

  async createItem(dto: CreateGuideItemRequest, actor: string): Promise<AdminGuideItem> {
    return toAdminGuideItem(await this.repository.createItem(dto, actor));
  }

  async updateItem(id: string, dto: UpdateGuideItemRequest, actor: string): Promise<AdminGuideItem | null> {
    const item = await this.repository.updateItem(id, dto, actor);
    return item && toAdminGuideItem(item);
  }

  async deleteItem(id: string, actor: string): Promise<boolean> {
    return this.repository.deleteItem(id, actor);
  }

  /** GET /admin/invitations/{id}/guide; null for an unknown invitation. */
  async invitationGuide(invitationId: string): Promise<AdminInvitationGuideResponse | null> {
    const selected = await this.repository.selection(invitationId);
    if (!selected) return null;
    return { invitationId, selectedItemIds: selected, effective: await this.effectiveGuide(invitationId) };
  }

  /** PUT /admin/invitations/{id}/guide. */
  async setInvitationGuide(invitationId: string, itemIds: string[], actor: string): Promise<SetGuideResult> {
    const result = await this.repository.setSelection(invitationId, itemIds, actor);
    if (result.status !== "ok") return result;
    const guide = await this.invitationGuide(invitationId);
    return guide ? { status: "ok", guide } : { status: "not_found" };
  }

  private async effectiveGuide(invitationId: string): Promise<GuestGuideResponse> {
    const picked = await this.repository.selectedActiveItems(invitationId);
    if (picked.length > 0) return { tailored: true, items: picked.map(toGuideItem) };
    const defaults = await this.repository.listItems({ activeOnly: true });
    return { tailored: false, items: defaults.map(toGuideItem) };
  }
}
