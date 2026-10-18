"use client";

/* eslint-disable @next/next/no-img-element -- previews stream through the admin proxy; next/image would cache them */

import type { AdminMediaItem, AdminMediaResponse, AdminWish, AdminWishesResponse, ModerationStatus } from "@grad/contract";
import { useCallback, useRef, type KeyboardEvent, type ReactNode } from "react";
import { DEFAULT_EVENT_TIME_ZONE, formatAdminDateTime } from "../../../lib/admin/datetime";
import {
  canFlagPublic,
  canPrint,
  MODERATION_ACTIONS,
  queueKeyCommand,
  STATUS_LABEL,
  type ModerationFields,
  type QueueFilter,
} from "../../../lib/admin/moderation";
import {
  loadMediaPageAction,
  loadWishesPageAction,
  moderateMediaAction,
  moderateWishAction,
  setMediaPublicAction,
  setWishPublicAction,
} from "../queue-actions";
import { PrintRequest } from "./PrintRequest";
import { useModerationQueue, type QueueControls, type QueuePaging } from "./useModerationQueue";

const when = (iso: string) => formatAdminDateTime(iso, DEFAULT_EVENT_TIME_ZONE);

const mediaId = (item: AdminMediaItem) => item.publicId;
const wishId = (item: AdminWish) => item.id;
const describePhoto = (item: AdminMediaItem) => `Photo from ${when(item.createdAt)}`;
const describeWish = (item: AdminWish) => `Wish from ${item.authorName}`;

interface Nouns {
  one: string;
  many: string;
}

const PHOTO: Nouns = { one: "photo", many: "photos" };
const WISH: Nouns = { one: "wish", many: "wishes" };

/**
 * Single-key shortcuts for a list of cards: J/K (or arrows) move between
 * cards, V/H/R show, hide or remove the focused one, P toggles public.
 */
function useQueueKeys(queue: QueueControls) {
  const listRef = useRef<HTMLUListElement>(null);
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLUListElement>) => {
      const target = event.target as HTMLElement;
      const command = queueKeyCommand({
        key: event.key,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        targetTag: target.tagName,
      });
      const card = target.closest<HTMLElement>("[data-queue-id]");
      if (!command || !card) return;
      event.preventDefault();
      const id = card.dataset.queueId!;
      if (command.type === "move") {
        const cards = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-queue-id]") ?? []);
        const next = cards[cards.indexOf(card) + command.by];
        next?.focus();
        next?.scrollIntoView({ block: "nearest" });
      } else if (command.type === "moderate") {
        queue.moderate(id, command.status);
      } else {
        queue.togglePublic(id);
      }
    },
    [queue]
  );
  return { listRef, onKeyDown };
}

function ModerationButtons({
  status,
  busy,
  onSelect,
}: {
  status: ModerationStatus;
  busy: boolean;
  onSelect: (status: ModerationStatus) => void;
}) {
  return (
    <div className="admin-segment" role="group" aria-label="Moderation">
      {MODERATION_ACTIONS.map((action) => (
        <button
          key={action.status}
          type="button"
          className="admin-segment__button"
          aria-pressed={status === action.status}
          aria-keyshortcuts={action.key.toUpperCase()}
          aria-disabled={busy || undefined}
          onClick={() => onSelect(action.status)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

function PublicToggle({
  item,
  busy,
  onToggle,
}: {
  item: ModerationFields & { processingStatus?: string };
  busy: boolean;
  onToggle: () => void;
}) {
  // Un-flagging always works; flagging needs a visible (and processed) item.
  const available = item.isPublic || canFlagPublic(item);
  return (
    <button
      type="button"
      className="admin-button admin-button--outline admin-toggle"
      aria-pressed={item.isPublic}
      aria-keyshortcuts="P"
      aria-disabled={busy || undefined}
      disabled={!available}
      onClick={onToggle}
    >
      Public
    </button>
  );
}

function StatusLine({ item, busy, children }: { item: ModerationFields; busy: boolean; children?: ReactNode }) {
  return (
    <p className="admin-queue-meta">
      <span className="admin-queue-status" data-status={item.status}>
        {STATUS_LABEL[item.status]}
      </span>
      {item.isPublic ? <span>{item.status === "visible" ? "Public" : "Public when visible"}</span> : null}
      {children}
      {busy ? <span className="admin-muted">Saving…</span> : null}
    </p>
  );
}

function ItemError({ message }: { message: string | undefined }) {
  return message ? (
    <p role="alert" className="admin-field-error">
      {message}
    </p>
  ) : null;
}

function LoadMore({ queue, nouns }: { queue: QueuePaging; nouns: Nouns }) {
  if (!queue.cursor) return <p className="admin-muted">That&apos;s every {nouns.one} in this view.</p>;
  return (
    <div className="admin-queue-more">
      {queue.loadError ? (
        <p role="alert" className="admin-field-error">
          Could not load more: {queue.loadError}
        </p>
      ) : null}
      <button
        type="button"
        className="admin-button admin-button--outline"
        onClick={() => void queue.loadMore()}
        disabled={queue.loadingMore}
        aria-disabled={queue.loadingMore}
      >
        {queue.loadingMore ? "Loading…" : queue.loadError ? "Try again" : `Load older ${nouns.many}`}
      </button>
    </div>
  );
}

function KeyboardHint() {
  return (
    <p className="admin-hint admin-queue-keys">
      Keyboard: <kbd>J</kbd>/<kbd>K</kbd> move, <kbd>V</kbd> show, <kbd>H</kbd> hide, <kbd>R</kbd> remove,{" "}
      <kbd>P</kbd> public.
    </p>
  );
}

const EMPTY: Record<QueueFilter, (nouns: Nouns) => string> = {
  latest: ({ many }) => `No ${many} yet. They appear here as soon as guests post them.`,
  processing: () => "Nothing is processing. Every upload has its thumbnails.",
  visible: ({ many }) => `No visible ${many}.`,
  public: ({ many }) => `No ${many} in the public set yet. Mark visible ones Public to add them.`,
  hidden: ({ many }) => `No hidden ${many}.`,
  removed: ({ many }) => `No removed ${many}.`,
};

export function PhotoQueue({ filter, initial }: { filter: QueueFilter; initial: AdminMediaResponse }) {
  const queue = useModerationQueue<AdminMediaItem>({
    initial,
    idOf: mediaId,
    describe: describePhoto,
    loadPage: (cursor) => loadMediaPageAction(filter, cursor),
    moderate: moderateMediaAction,
    setPublic: setMediaPublicAction,
  });
  const keys = useQueueKeys(queue);

  if (queue.items.length === 0) return <p>{EMPTY[filter](PHOTO)}</p>;

  return (
    <>
      <KeyboardHint />
      <p role="status" className="sr-only">
        {queue.announcement}
      </p>
      <ul className="admin-queue admin-queue--photos" ref={keys.listRef} onKeyDown={keys.onKeyDown}>
        {queue.items.map((item) => {
          const busy = Boolean(queue.pending[item.publicId]);
          return (
            <li
              key={item.publicId}
              className="admin-queue-item"
              data-queue-id={item.publicId}
              data-status={item.status}
              tabIndex={0}
              aria-label={`${describePhoto(item)}, ${STATUS_LABEL[item.status].toLowerCase()}${item.isPublic ? ", public" : ""}`}
              aria-busy={busy}
            >
              <div className="admin-queue-media">
                {item.processingStatus === "ready" ? (
                  <img
                    src={`/admin/preview/${encodeURIComponent(item.publicId)}/thumb`}
                    alt={describePhoto(item)}
                    width={item.width ?? undefined}
                    height={item.height ?? undefined}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="admin-muted">
                    {item.processingStatus === "pending" ? "Processing…" : "Processing failed: no preview"}
                  </span>
                )}
              </div>
              <div className="admin-queue-body">
                <StatusLine item={item} busy={busy}>
                  <span className="admin-muted">{when(item.createdAt)}</span>
                </StatusLine>
                <ModerationButtons
                  status={item.status}
                  busy={busy}
                  onSelect={(status) => queue.moderate(item.publicId, status)}
                />
                <div className="admin-actions">
                  <PublicToggle item={item} busy={busy} onToggle={() => queue.togglePublic(item.publicId)} />
                  {canPrint(item) ? <PrintRequest publicId={item.publicId} /> : null}
                </div>
                <p className="admin-hint">
                  Invitation <code title={item.invitationId}>{item.invitationId.slice(0, 8)}</code>
                </p>
                <ItemError message={queue.errors[item.publicId]} />
              </div>
            </li>
          );
        })}
      </ul>
      <LoadMore queue={queue} nouns={PHOTO} />
    </>
  );
}

export function WishQueue({ filter, initial }: { filter: QueueFilter; initial: AdminWishesResponse }) {
  const queue = useModerationQueue<AdminWish>({
    initial,
    idOf: wishId,
    describe: describeWish,
    loadPage: (cursor) => loadWishesPageAction(filter, cursor),
    moderate: moderateWishAction,
    setPublic: setWishPublicAction,
  });
  const keys = useQueueKeys(queue);

  if (queue.items.length === 0) return <p>{EMPTY[filter](WISH)}</p>;

  return (
    <>
      <KeyboardHint />
      <p role="status" className="sr-only">
        {queue.announcement}
      </p>
      <ul className="admin-queue admin-queue--wishes" ref={keys.listRef} onKeyDown={keys.onKeyDown}>
        {queue.items.map((item) => {
          const busy = Boolean(queue.pending[item.id]);
          return (
            <li
              key={item.id}
              className="admin-queue-item"
              data-queue-id={item.id}
              data-status={item.status}
              tabIndex={0}
              aria-label={`${describeWish(item)}, ${STATUS_LABEL[item.status].toLowerCase()}${item.isPublic ? ", public" : ""}`}
              aria-busy={busy}
            >
              <div className="admin-queue-body">
                <StatusLine item={item} busy={busy}>
                  <span className="admin-muted">{when(item.createdAt)}</span>
                </StatusLine>
                <blockquote className="admin-queue-wish">
                  <p>{item.body}</p>
                  <footer>{item.authorName}</footer>
                </blockquote>
                <ModerationButtons status={item.status} busy={busy} onSelect={(status) => queue.moderate(item.id, status)} />
                <div className="admin-actions">
                  <PublicToggle item={item} busy={busy} onToggle={() => queue.togglePublic(item.id)} />
                </div>
                <ItemError message={queue.errors[item.id]} />
              </div>
            </li>
          );
        })}
      </ul>
      <LoadMore queue={queue} nouns={WISH} />
    </>
  );
}
