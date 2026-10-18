import type { AdminMediaQuery, AdminWishesQuery, ModerationStatus } from "@grad/contract";

/*
 * The moderation queue (#64, #75). There is no approval step (owner decision
 * 2026-09-30): photos and wishes show at once and moderators take them down
 * afterwards, so the "queue" is the admin listing of every state, newest
 * first, with filters. "Show" puts a hidden or removed item back.
 */

export type QueueKind = "photos" | "wishes";

export type QueueFilter = "latest" | "processing" | "visible" | "public" | "hidden" | "removed";

export interface QueueFilterOption {
  id: QueueFilter;
  label: string;
}

/** Photos are listed 24 at a time (thumbnails over venue Wi-Fi), wishes 30. */
export const QUEUE_PAGE_SIZE: Record<QueueKind, number> = { photos: 24, wishes: 30 };

const SHARED_FILTERS: QueueFilterOption[] = [
  { id: "visible", label: "Visible" },
  { id: "public", label: "Public" },
  { id: "hidden", label: "Hidden" },
  { id: "removed", label: "Removed" },
];

/** Filter pills per kind, in display order. "Processing" lists uploads whose derivatives aren't ready yet. */
export const QUEUE_FILTERS: Record<QueueKind, QueueFilterOption[]> = {
  photos: [{ id: "latest", label: "New" }, { id: "processing", label: "Processing" }, ...SHARED_FILTERS],
  wishes: [{ id: "latest", label: "New" }, ...SHARED_FILTERS],
};

export interface QueueView {
  kind: QueueKind;
  filter: QueueFilter;
}

/** Reads `?kind=&filter=`; anything unknown falls back to the newest photos. */
export function parseQueueView(params: { kind?: string | string[]; filter?: string | string[] }): QueueView {
  const kind: QueueKind = params.kind === "wishes" ? "wishes" : "photos";
  const filter = QUEUE_FILTERS[kind].find((option) => option.id === params.filter)?.id ?? "latest";
  return { kind, filter };
}

export function queueHref(view: QueueView): string {
  const params = new URLSearchParams({ kind: view.kind });
  if (view.filter !== "latest") params.set("filter", view.filter);
  return `/admin/moderation?${params.toString()}`;
}

type MediaFilterQuery = Pick<AdminMediaQuery, "status" | "processing" | "isPublic">;
type WishFilterQuery = Pick<AdminWishesQuery, "status" | "isPublic">;

/** API filters for a photo view. "Public" means in the curated gallery now: flagged and visible. */
export function mediaFilterQuery(filter: QueueFilter): Partial<MediaFilterQuery> {
  switch (filter) {
    case "latest":
      return {};
    case "processing":
      return { processing: "pending" };
    case "public":
      return { status: "visible", isPublic: true };
    default:
      return { status: filter };
  }
}

/** API filters for a wish view; "processing" doesn't apply to wishes and lists everything. */
export function wishFilterQuery(filter: QueueFilter): Partial<WishFilterQuery> {
  switch (filter) {
    case "latest":
    case "processing":
      return {};
    case "public":
      return { status: "visible", isPublic: true };
    default:
      return { status: filter };
  }
}

/** The three moderation buttons, in order. Each sets that state; the current one is pressed. */
export const MODERATION_ACTIONS: { status: ModerationStatus; label: string; done: string; key: string }[] = [
  { status: "visible", label: "Show", done: "shown", key: "v" },
  { status: "hidden", label: "Hide", done: "hidden", key: "h" },
  { status: "removed", label: "Remove", done: "removed", key: "r" },
];

export const STATUS_LABEL: Record<ModerationStatus, string> = {
  visible: "Visible",
  hidden: "Hidden",
  removed: "Removed",
};

/** Single-key shortcuts while focus is in the queue. Ignored with modifiers or inside form fields. */
export type QueueKeyCommand =
  | { type: "move"; by: 1 | -1 }
  | { type: "moderate"; status: ModerationStatus }
  | { type: "public" };

export function queueKeyCommand(event: {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  targetTag?: string;
}): QueueKeyCommand | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  const tag = event.targetTag?.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return null;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (key === "j" || key === "ArrowDown") return { type: "move", by: 1 };
  if (key === "k" || key === "ArrowUp") return { type: "move", by: -1 };
  if (key === "p") return { type: "public" };
  const action = MODERATION_ACTIONS.find((candidate) => candidate.key === key);
  return action ? { type: "moderate", status: action.status } : null;
}

/** Fields an optimistic change touches, so a rollback restores exactly these. */
export interface ModerationFields {
  status: ModerationStatus;
  isPublic: boolean;
}

/** Whether the public flag can be turned on now (the API answers 409 otherwise). Un-flagging always works. */
export function canFlagPublic(item: ModerationFields & { processingStatus?: string }): boolean {
  return item.status === "visible" && (item.processingStatus === undefined || item.processingStatus === "ready");
}

/** Whether "Print" is offered: the API only prints visible, processed photos. */
export function canPrint(item: { status: ModerationStatus; processingStatus: string }): boolean {
  return item.status === "visible" && item.processingStatus === "ready";
}

/** Replaces one item's moderation fields by id, leaving every other item (and array order) alone. */
export function patchItem<T extends ModerationFields>(
  items: readonly T[],
  id: string,
  idOf: (item: T) => string,
  patch: Partial<ModerationFields>
): T[] {
  return items.map((item) => (idOf(item) === id ? { ...item, ...patch } : item));
}

/** Appends a further page, dropping anything already listed (a new upload can shift the cursor window). */
export function appendPage<T>(items: readonly T[], next: readonly T[], idOf: (item: T) => string): T[] {
  const seen = new Set(items.map(idOf));
  return [...items, ...next.filter((item) => !seen.has(idOf(item)))];
}
