import type { GalleryItem } from "../../../data/gallery";
import type { MessageKeys } from "../../../lib/i18n/format";

/**
 * Pure rules behind /wall (the public wall of wishes and instant photos), kept out of the
 * components so they are unit-tested (`wall-logic.test.ts`).
 */

/** The composer's two modes: write a wish (default) or take a photo. */
export type WallMode = "wish" | "photo";
/** The feed's filter chips: All · Wishes · Photos. */
export type WallShow = "all" | "wishes" | "photos";

type Param = string | string[] | undefined;
const first = (value: Param) => (Array.isArray(value) ? value[0] : value);

/** `?mode=photo` (also `camera`, the old /gallery and /polaroid) opens the camera; anything else writes a wish. */
export function parseMode(value: Param): WallMode {
  const mode = first(value)?.toLowerCase();
  return mode === "photo" || mode === "camera" ? "photo" : "wish";
}

/** `?show=photos|wishes` picks a filter chip; anything else shows everything. */
export function parseShow(value: Param): WallShow {
  const show = first(value)?.toLowerCase();
  return show === "photos" || show === "wishes" ? show : "all";
}

/** The /wall URL for a mode and filter, defaults left out, so the plain URL stays `/wall`. */
export function wallHref(mode: WallMode, show: WallShow): string {
  const params = new URLSearchParams();
  if (mode === "photo") params.set("mode", "photo");
  if (show !== "all") params.set("show", show);
  const query = params.toString();
  return query ? `/wall?${query}` : "/wall";
}

/** The feed items a filter chip shows, order kept (newest first). */
export function filterWall<T extends Pick<GalleryItem, "type">>(items: readonly T[], show: WallShow): T[] {
  if (show === "all") return [...items];
  const type = show === "photos" ? "POLAROID" : "WISH";
  return items.filter((item) => item.type === type);
}

/** Whether a local (outbox) item belongs under a filter chip. */
export function localShown(kind: "wish" | "photo", show: WallShow): boolean {
  return show === "all" || (show === "photos" ? kind === "photo" : kind === "wish");
}

/**
 * Local items the feed already carries are shown once: the feed's copy wins. A local item
 * knows its server id once accepted (`wish-<id>` / `photo-<publicId>` in the feed).
 */
export function withoutListed<T extends { kind: "wish" | "photo"; serverId?: string }>(local: readonly T[], feedIds: ReadonlySet<string>): T[] {
  return local.filter((item) => !(item.serverId && feedIds.has(`${item.kind}-${item.serverId}`)));
}

/** API limits for POST /wishes (ADR-019): body 1–1000, authorName 1–60 characters. */
export const WISH_MAX = 1000;
export const NAME_MAX = 60;

export type DraftProblem = "message" | "name" | null;

/**
 * Whether a wish can be sent. A visitor without an invitation must give a name; an invited
 * guest may leave it blank (the API then uses the invitation's guest name).
 */
export function draftProblem(body: string, name: string, invited: boolean): DraftProblem {
  const text = body.trim();
  if (text.length === 0 || text.length > WISH_MAX) return "message";
  const author = name.trim();
  if (author.length > NAME_MAX || (!invited && author.length === 0)) return "name";
  return null;
}

/**
 * What a failed POST /wishes means for the visitor. `retry`: trying the same wish again later can
 * work (rate limit, a busy server, the network), so it stays in the feed with Retry; otherwise the
 * visitor has to change it first, and it goes back to the composer. `text` is the API's own
 * message, used only for the word filter (422), whose reason the visitor needs verbatim.
 */
export type WishFailure = { key: MessageKeys<"wishes.error.">; retry: boolean; text?: string };

/** The longest API message shown inline; anything longer is the generic filter line. */
const FILTER_MESSAGE_MAX = 300;

export function wishFailure(status: number | "network", body?: unknown): WishFailure {
  if (status === "network") return { key: "wishes.error.network", retry: true };
  if (status === 429) return { key: "wishes.error.tooMany", retry: true };
  if (status === 422) {
    const message = apiMessage(body);
    return message ? { key: "wishes.error.filtered", retry: false, text: message } : { key: "wishes.error.filtered", retry: false };
  }
  if (status === 400) return { key: "wishes.error.length", retry: false };
  if (status === 401 || status === 403 || status === 404) return { key: "wishes.error.invalid", retry: false };
  if (status === 410) return { key: "wishes.error.expired", retry: false };
  return { key: "wishes.error.generic", retry: status >= 500 || status === 408 };
}

/** The API's `{ message }` (Fastify error shape), trimmed; null when absent, empty or too long. */
export function apiMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const message = (body as Record<string, unknown>).message;
  if (typeof message !== "string") return null;
  const text = message.trim();
  return text && text.length <= FILTER_MESSAGE_MAX ? text : null;
}

/** The 201 body of POST /wishes (contract `createWishResponseSchema`), checked before it is kept. */
export type PostedWish = { id: string; authorName: string; body: string; createdAt: string };

export function isPostedWish(v: unknown): v is PostedWish {
  if (!v || typeof v !== "object") return false;
  const w = v as Record<string, unknown>;
  return typeof w.id === "string" && typeof w.authorName === "string" && typeof w.body === "string" && typeof w.createdAt === "string";
}

/**
 * The 201 body of POST /media with the public wall's review state.
 * TODO(ADR-019): replace with `uploadMediaResponseSchema` from @grad/contract once it carries
 * `reviewStatus` (and `shotsRemaining` for visitors without an invitation, who have no roll).
 */
export type WallUploadResponse = {
  publicId: string;
  /** Null when the API sends no roll count (a visitor without an invitation). */
  shotsRemaining: number | null;
  /** `pending`: shown to everyone only after an organizer approves it. Missing means visible (older API). */
  reviewStatus: "pending" | "visible";
};

export function parseUploadResponse(value: unknown): WallUploadResponse | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (typeof r.publicId !== "string" || r.publicId.length === 0) return null;
  if (r.processingStatus !== undefined && r.processingStatus !== "pending" && r.processingStatus !== "ready" && r.processingStatus !== "failed") return null;
  const count = r.shotsRemaining;
  const shotsRemaining = typeof count === "number" && Number.isInteger(count) && count >= 0 ? count : null;
  if (count !== undefined && count !== null && shotsRemaining === null) return null;
  if (r.reviewStatus !== undefined && r.reviewStatus !== "pending" && r.reviewStatus !== "visible") return null;
  return { publicId: r.publicId, shotsRemaining, reviewStatus: r.reviewStatus === "pending" ? "pending" : "visible" };
}

/** How an outbox item shows on its card: the status label, its tone and which actions it offers. */
export type OutboxCard<K extends string> = { status: K; tone: "pending" | "error" | "done"; actions: ("retry" | "edit" | "remove")[] };

type OutboxStatus = "sending" | "queued" | "failed" | "rejected" | "sent";

export function wishCard(status: OutboxStatus): OutboxCard<MessageKeys<"wishes.status.">> {
  switch (status) {
    case "sending":
      return { status: "wishes.status.sending", tone: "pending", actions: [] };
    case "queued":
      return { status: "wishes.status.queued", tone: "pending", actions: ["retry", "edit"] };
    case "failed":
      return { status: "wishes.status.failed", tone: "error", actions: ["retry", "edit"] };
    case "rejected":
      return { status: "wishes.status.failed", tone: "error", actions: ["edit"] };
    case "sent":
      return { status: "wishes.status.sent", tone: "done", actions: [] };
  }
}

/** How an outbox photo shows: "Waiting for approval" once sent when the API holds it for review. */
export function shotCard(status: OutboxStatus, review?: "pending" | "visible"): OutboxCard<MessageKeys<"camera.status."> | "wall.waiting"> {
  switch (status) {
    case "sending":
      return { status: "camera.status.sending", tone: "pending", actions: [] };
    case "queued":
      return { status: "camera.status.queued", tone: "pending", actions: ["retry"] };
    case "failed":
      return { status: "camera.status.failed", tone: "error", actions: ["retry"] };
    case "rejected":
      return { status: "camera.status.failed", tone: "error", actions: ["remove"] };
    case "sent":
      return review === "pending" ? { status: "wall.waiting", tone: "pending", actions: [] } : { status: "camera.status.sent", tone: "done", actions: [] };
  }
}
