import type {
  AdminWishesResponse,
  CreateWishRequest,
  ModerateWishResponse,
  ModerationStatus,
  PageQuery,
  Wish,
  WishesResponse,
} from "@grad/contract";
import { InvitationsService } from "../invitations/invitations.service.js";
import { WishesRepository, type StoredWish } from "./wishes.repository.js";

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

type Repository = Pick<WishesRepository, "create" | "countSince" | "list" | "moderate">;

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
    const page = await this.page(query, true);
    return { items: page.items.map(toWish), nextCursor: page.nextCursor };
  }

  /** GET /admin/wishes: every state, so hidden wishes can be found and restored. */
  async listAll(query: PageQuery): Promise<AdminWishesResponse> {
    const page = await this.page(query, false);
    return {
      items: page.items.map((w) => ({ ...toWish(w), status: w.moderationStatus })),
      nextCursor: page.nextCursor,
    };
  }

  async moderate(id: string, status: ModerationStatus, actor: string): Promise<ModerateWishResult> {
    const result = await this.repository.moderate(id, status, actor);
    if (result.status === "not_found") return result;
    return { status: "ok", wish: { id: result.wish.id, status: result.wish.moderationStatus } };
  }

  private async page(query: PageQuery, visibleOnly: boolean) {
    const afterId = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
    const rows = await this.repository.list({ limit: query.limit, afterId, visibleOnly });
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    const nextCursor = rows.length > query.limit && last ? encodeCursor(last.id) : null;
    return { items, nextCursor };
  }
}
