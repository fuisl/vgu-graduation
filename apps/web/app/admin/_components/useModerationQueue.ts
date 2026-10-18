"use client";

import type { ModerationStatus } from "@grad/contract";
import { useCallback, useRef, useState } from "react";
import {
  appendPage,
  MODERATION_ACTIONS,
  patchItem,
  type ModerationFields,
} from "../../../lib/admin/moderation";
import type { QueueResult } from "../queue-actions";

export interface QueuePage<T> {
  items: T[];
  nextCursor: string | null;
}

/** What keyboard shortcuts need: writes addressed by id. */
export interface QueueControls {
  moderate: (id: string, status: ModerationStatus) => void;
  togglePublic: (id: string) => void;
}

/** What the "Load older" footer needs. */
export interface QueuePaging {
  cursor: string | null;
  loadingMore: boolean;
  loadError: string | null;
  loadMore: () => Promise<void>;
}

interface Options<T> {
  initial: QueuePage<T>;
  idOf: (item: T) => string;
  /** "Photo from 12 Oct, 10:32", for announcements. */
  describe: (item: T) => string;
  loadPage: (cursor: string) => Promise<QueueResult<QueuePage<T>>>;
  moderate: (id: string, status: ModerationStatus) => Promise<QueueResult<ModerationFields>>;
  setPublic: (id: string, isPublic: boolean) => Promise<QueueResult<ModerationFields>>;
}

const UNREACHABLE = "Could not reach the server. Check the connection and try again.";

/**
 * A server action that fails in transit rejects instead of resolving; one that
 * redirects (expired session) may resolve with nothing while the router leaves.
 * Both become a plain failure here.
 */
async function settle<T>(call: () => Promise<QueueResult<T>>): Promise<QueueResult<T>> {
  try {
    const result = await call();
    return result && typeof result === "object" ? result : { ok: false, message: UNREACHABLE };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}

/**
 * State for one moderation list: optimistic moderation and public-flag changes
 * with rollback, per-item pending and error state, cursor pagination and a
 * polite announcement for screen readers. Each item takes one write at a time;
 * other items stay free, so a moderator can work down the list without waiting.
 */
export function useModerationQueue<T extends ModerationFields>(options: Options<T>) {
  const { idOf, describe } = options;
  const [items, setItems] = useState<T[]>(options.initial.items);
  const [cursor, setCursor] = useState<string | null>(options.initial.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, true>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = useState("");

  // Read the latest values inside async handlers without stale closures.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const pendingRef = useRef(new Set<string>());
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const setItemError = useCallback((id: string, message: string | null) => {
    setErrors((current) => {
      const next = { ...current };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  }, []);

  const begin = useCallback((id: string): T | null => {
    const item = itemsRef.current.find((candidate) => idOf(candidate) === id);
    if (!item || pendingRef.current.has(id)) return null;
    pendingRef.current.add(id);
    setPending((current) => ({ ...current, [id]: true }));
    return item;
  }, [idOf]);

  const end = useCallback((id: string) => {
    pendingRef.current.delete(id);
    setPending((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  /** Optimistically applies `patch`, then settles on the server's answer or rolls back. */
  const write = useCallback(
    async (
      id: string,
      patch: Partial<ModerationFields>,
      call: () => Promise<QueueResult<ModerationFields>>,
      words: { done: string; failed: string }
    ) => {
      const before = begin(id);
      if (!before) return;
      const previous: ModerationFields = { status: before.status, isPublic: before.isPublic };
      setItemError(id, null);
      setItems((current) => patchItem(current, id, idOf, patch));

      const result = await settle(call);
      if (result.ok) {
        setItems((current) => patchItem(current, id, idOf, { status: result.data.status, isPublic: result.data.isPublic }));
        setAnnouncement(`${describe(before)} ${words.done}.`);
      } else {
        setItems((current) => patchItem(current, id, idOf, previous));
        setItemError(id, `Could not ${words.failed}: ${result.message}`);
        setAnnouncement(`${describe(before)} was not changed. ${result.message}`);
      }
      end(id);
    },
    [begin, describe, end, idOf, setItemError]
  );

  const moderate = useCallback(
    (id: string, status: ModerationStatus) => {
      const item = itemsRef.current.find((candidate) => idOf(candidate) === id);
      if (!item || item.status === status) return;
      const action = MODERATION_ACTIONS.find((candidate) => candidate.status === status)!;
      void write(id, { status }, () => optionsRef.current.moderate(id, status), {
        done: action.done,
        failed: action.label.toLowerCase(),
      });
    },
    [idOf, write]
  );

  const togglePublic = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((candidate) => idOf(candidate) === id);
      if (!item) return;
      const isPublic = !item.isPublic;
      void write(id, { isPublic }, () => optionsRef.current.setPublic(id, isPublic), {
        done: isPublic ? "added to the public set" : "taken out of the public set",
        failed: isPublic ? "make it public" : "take it out of the public set",
      });
    },
    [idOf, write]
  );

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadError(null);
    const result = await settle(() => optionsRef.current.loadPage(cursor));
    if (result.ok) {
      setItems((current) => appendPage(current, result.data.items, idOf));
      setCursor(result.data.nextCursor);
      setAnnouncement(
        result.data.items.length === 0 ? "No more items." : `Loaded ${result.data.items.length} more.`
      );
    } else {
      setLoadError(result.message);
    }
    setLoadingMore(false);
  }, [cursor, idOf, loadingMore]);

  return { items, cursor, loadingMore, loadError, pending, errors, announcement, moderate, togglePublic, loadMore };
}
