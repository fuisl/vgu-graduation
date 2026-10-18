import {
  type AdminWishesQuery,
  type AdminWishesResponse,
  CACHE_TAGS,
  type CacheTag,
  type CreateWishRequest,
  type ModerateWishResponse,
  type ModerationStatus,
  type PageQuery,
  type PublicWishesResponse,
  type SetWishPublicResponse,
  type Wish,
  type WishesResponse,
} from "@grad/contract";
import { InvitationsService } from "../invitations/invitations.service.js";
import { type ListWishesOptions, WishesRepository, type StoredWish } from "./wishes.repository.js";

/**
 * Per-invitation write cap on POST /wishes, on top of Traefik's per-IP limit:
 * one invitation may post at most this many wishes per window. Generous for a
 * guest writing to several graduates, tight enough that a leaked link can't
 * flood the event display.
 */
export const WISH_RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };

export type CreateWishResult =
  | { status: "ok"; wish: Wish }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "rate_limited"; retryAfterSeconds: number };

export type ModerateWishResult = { status: "ok"; wish: ModerateWishResponse } | { status: "not_found" };

export type SetWishPublicResult =
  | { status: "ok"; wish: SetWishPublicResponse }
  | { status: "not_eligible"; moderationStatus: ModerationStatus }
  | { status: "not_found" };

/** Thrown for a cursor that did not come from `nextCursor`; the route answers 400. */
export class InvalidCursorError extends Error {
  constructor() {
    super("Invalid cursor");
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Opaque cursor: base64url of the id of the last wish on the page. */
export function encodeCursor(lastId: string): string {
  return Buffer.from(lastId).toString("base64url");
}

/** Returns the wish id inside a cursor, or throws `InvalidCursorError`. */
export function decodeCursor(raw: string): string {
  const id = Buffer.from(raw, "base64url").toString("utf8");
  if (!UUID.test(id)) throw new InvalidCursorError();
  return id;
}

export function toWish(stored: StoredWish): Wish {
  return {
    id: stored.id,
    authorName: stored.authorName,
    body: stored.body,
    createdAt: stored.createdAt.toISOString(),
  };
}

type Repository = Pick<WishesRepository, "create" | "countSince" | "list" | "moderate" | "setPublic">;

export class WishesService {
  constructor(
    private readonly invitations: Pick<InvitationsService, "resolveByToken"> = new InvitationsService(),
    private readonly repository: Repository = new WishesRepository(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Stores a wish from the invitation behind `token`. It is visible at once
   * (no pre-review, principles.md §8); admins hide or remove it afterwards.
   * The author name defaults to the guest's name.
   */
  async createByToken(token: string, dto: CreateWishRequest): Promise<CreateWishResult> {
    const resolved = await this.invitations.resolveByToken(token);
    if (resolved.status !== "ok") return { status: resolved.status };
    const { id, guest } = resolved.invitation;

    const windowStart = new Date(this.now().getTime() - WISH_RATE_LIMIT.windowMs);
    if ((await this.repository.countSince(id, windowStart)) >= WISH_RATE_LIMIT.max) {
      return { status: "rate_limited", retryAfterSeconds: Math.ceil(WISH_RATE_LIMIT.windowMs / 1000) };
    }

    const stored = await this.repository.create(id, dto.authorName ?? guest.name, dto.body);
    return { status: "ok", wish: toWish(stored) };
  }

  /** GET /wishes: visible wishes only, newest first. */
  async listVisible(query: PageQuery): Promise<WishesResponse> {
    const page = await this.page(query, { visibleOnly: true });
    return { items: page.items.map(toWish), nextCursor: page.nextCursor };
  }

  /** GET /wishes/public (#75): visible wishes a moderator flagged public, newest first. */
  async listPublic(query: PageQuery): Promise<PublicWishesResponse> {
    const page = await this.page(query, { visibleOnly: true, publicOnly: true });
    return { items: page.items.map(toWish), nextCursor: page.nextCursor };
  }

  /** GET /admin/wishes: every state, so hidden wishes can be found and restored; optional filters (#64). */
  async listAll(query: AdminWishesQuery): Promise<AdminWishesResponse> {
    const page = await this.page(query, { visibleOnly: false, status: query.status, isPublic: query.isPublic });
    return {
      items: page.items.map((w) => ({ ...toWish(w), status: w.moderationStatus, isPublic: w.isPublic })),
      nextCursor: page.nextCursor,
    };
  }

  /**
   * Shows, hides or removes a wish. `revalidateTags` names the listings that
   * changed: wishes, and the public set too when the wish is flagged public.
   */
  async moderate(id: string, status: ModerationStatus, actor: string): Promise<ModerateWishResult> {
    const result = await this.repository.moderate(id, status, actor);
    if (result.status === "not_found") return result;
    const { wish, changed } = result;
    const revalidateTags: CacheTag[] = changed
      ? [CACHE_TAGS.wishes, ...(wish.isPublic ? [CACHE_TAGS.publicWishes] : [])]
      : [];
    return { status: "ok", wish: { id: wish.id, status: wish.moderationStatus, isPublic: wish.isPublic, revalidateTags } };
  }

  /** POST /admin/wishes/{id}/public (#75). */
  async setPublic(id: string, isPublic: boolean, actor: string): Promise<SetWishPublicResult> {
    const result = await this.repository.setPublic(id, isPublic, actor);
    if (result.status === "not_found") return result;
    if (result.status === "not_eligible") return { status: "not_eligible", moderationStatus: result.wish.moderationStatus };
    const { wish, changed } = result;
    return {
      status: "ok",
      wish: {
        id: wish.id,
        status: wish.moderationStatus,
        isPublic: wish.isPublic,
        revalidateTags: changed ? [CACHE_TAGS.publicWishes] : [],
      },
    };
  }

  private async page(query: PageQuery, filters: Omit<ListWishesOptions, "limit" | "afterId">) {
    const afterId = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
    const rows = await this.repository.list({ limit: query.limit, afterId, ...filters });
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    const nextCursor = rows.length > query.limit && last ? encodeCursor(last.id) : null;
    return { items, nextCursor };
  }
}
