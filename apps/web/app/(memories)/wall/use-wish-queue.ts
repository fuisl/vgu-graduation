import { useCallback, useEffect, useRef, useState } from "react";
import { browserApiOrigin } from "../../../lib/api/browser-origin";
import { rememberOwnPost } from "../../../lib/memories/own-posts";
import { isOffline } from "../gallery/local-items";
import { isPostedWish, wishFailure, type WishFailure } from "./wall-logic";

/**
 * Optimistic wishes on /wall: a sent wish shows at the top of the feed at once and keeps its
 * state (`sending`, `queued` while offline and sent by itself once back online, `failed` with
 * Retry and Edit when trying again can work, `rejected` with Edit only when the API refuses it
 * as it is, `sent`) until the feed lists it. Nothing typed is ever lost: Edit puts it back.
 */
export type WishStatus = "sending" | "queued" | "failed" | "rejected" | "sent";

export type PendingWish = {
  key: string;
  body: string;
  /** The name as typed; blank lets the API use the invitation's guest name. */
  name: string;
  status: WishStatus;
  failure?: WishFailure;
  /** The API's id once saved, so the feed can drop this copy when it lists the wish. */
  id?: string;
};

export type WishEvent =
  | { type: "sending" | "sent" | "queued" }
  | { type: "failed"; failure: WishFailure }
  /** Refused as it is (word filter, length): it needs an edit, so the composer takes it back when free. */
  | { type: "rejected"; failure: WishFailure; key: string };

let counter = 0;
const nextKey = () => `wish-${Date.now().toString(36)}-${(counter += 1)}`;

/**
 * POST {API}/wishes straight from the browser (ADR-019): the invitation cookie rides along when
 * there is one (`credentials: "include"`); without one the API needs `authorName`.
 */
async function postWish(wish: PendingWish): Promise<Response> {
  return fetch(`${browserApiOrigin()}/wishes`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: wish.body, ...(wish.name ? { authorName: wish.name } : {}) }),
  });
}

export function useWishQueue({ onEvent }: { onEvent: (event: WishEvent) => void }) {
  const [wishes, setWishes] = useState<PendingWish[]>([]);
  const wishesRef = useRef<PendingWish[]>([]);
  const callbacks = useRef({ onEvent });
  callbacks.current = { onEvent };

  const commit = useCallback((change: (current: PendingWish[]) => PendingWish[]) => {
    setWishes((current) => {
      const updated = change(current);
      wishesRef.current = updated;
      return updated;
    });
  }, []);
  const patch = useCallback(
    (key: string, next: Partial<PendingWish>) => commit((current) => current.map((wish) => (wish.key === key ? { ...wish, ...next } : wish))),
    [commit],
  );

  const post = useCallback(async (wish: PendingWish) => {
    const emit = (event: WishEvent) => callbacks.current.onEvent(event);
    if (isOffline()) {
      patch(wish.key, { status: "queued", failure: undefined });
      emit({ type: "queued" });
      return;
    }
    patch(wish.key, { status: "sending", failure: undefined });
    emit({ type: "sending" });

    let response: Response;
    try {
      response = await postWish(wish);
    } catch {
      if (isOffline()) {
        patch(wish.key, { status: "queued", failure: undefined });
        emit({ type: "queued" });
      } else {
        const failure = wishFailure("network");
        patch(wish.key, { status: "failed", failure });
        emit({ type: "failed", failure });
      }
      return;
    }

    const body: unknown = await response.json().catch(() => null);
    if (response.ok) {
      const posted = isPostedWish(body) ? body : null;
      // Visible at once: the feed shows the visitor's own wish even before the live feed brings it (ADR-014).
      if (posted) rememberOwnPost({ kind: "wish", ...posted, savedAt: Date.now() });
      patch(wish.key, { status: "sent", id: posted?.id });
      emit({ type: "sent" });
      return;
    }
    const failure = wishFailure(response.status, body);
    if (failure.retry) {
      patch(wish.key, { status: "failed", failure });
      emit({ type: "failed", failure });
      return;
    }
    patch(wish.key, { status: "rejected", failure });
    emit({ type: "rejected", failure, key: wish.key });
  }, [patch]);

  const send = useCallback((body: string, name: string) => {
    const wish: PendingWish = { key: nextKey(), body, name, status: "sending" };
    commit((current) => [wish, ...current]);
    void post(wish);
  }, [commit, post]);

  const retry = useCallback((key: string) => {
    const wish = wishesRef.current.find((item) => item.key === key);
    if (wish && wish.status !== "sending" && wish.status !== "sent") void post(wish);
  }, [post]);

  /** Takes a wish that did not go out of the feed, so the composer can hold it again. */
  const take = useCallback((key: string) => {
    const wish = wishesRef.current.find((item) => item.key === key);
    commit((current) => current.filter((item) => item.key !== key));
    return wish;
  }, [commit]);

  useEffect(() => {
    const flush = () => {
      for (const wish of wishesRef.current) if (wish.status === "queued") void post(wish);
    };
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [post]);

  return { wishes, send, retry, take };
}
