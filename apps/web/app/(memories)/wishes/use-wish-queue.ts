import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageKeys } from "../../../lib/i18n/format";
import { rememberOwnPost } from "../../../lib/memories/own-posts";
import { isOffline } from "../gallery/local-items";

/**
 * Optimistic wishes: a sent wish shows at the top of the feed at once and keeps its state
 * (`sending`, `queued` while offline and sent by itself once back online, `failed` with
 * Retry, `rejected` when sending again cannot help, `sent`) until the listing includes it.
 */
export type WishStatus = "sending" | "queued" | "failed" | "rejected" | "sent";

export type PendingWish = {
  key: string;
  body: string;
  alias: string;
  status: WishStatus;
  error?: MessageKeys<"wishes.error.">;
  /** The API's id once saved, so the feed can drop this copy when it lists the wish. */
  id?: string;
};

/** What a failed POST /api/wishes means for the guest, by status, in their language (#9). Never echoes server detail. */
function wishErrorId(status: number) {
  if (status === 401) return "wishes.error.signedOut" as const;
  if (status === 404) return "wishes.error.invalid" as const;
  if (status === 410) return "wishes.error.expired" as const;
  if (status === 429) return "wishes.error.tooMany" as const;
  if (status === 400) return "wishes.error.length" as const;
  return "wishes.error.generic" as const;
}

/** The 201 body of POST /api/wishes (contract `createWishResponseSchema`), checked before it is kept. */
function isPostedWish(v: unknown): v is { id: string; authorName: string; body: string; createdAt: string } {
  if (!v || typeof v !== "object") return false;
  const w = v as Record<string, unknown>;
  return typeof w.id === "string" && typeof w.authorName === "string" && typeof w.body === "string" && typeof w.createdAt === "string";
}

/** Trying again later can work for these; the others need the guest to change something first. */
const retryable = (status: number) => status === 429 || status >= 500;

export type WishEvent = { type: "sending" | "sent" | "queued" } | { type: "failed"; error: MessageKeys<"wishes.error."> };

let counter = 0;
const nextKey = () => `wish-${Date.now().toString(36)}-${(counter += 1)}`;

export function useWishQueue({ onEvent, onSignedOut }: { onEvent: (event: WishEvent) => void; onSignedOut: () => void }) {
  const [wishes, setWishes] = useState<PendingWish[]>([]);
  const wishesRef = useRef<PendingWish[]>([]);
  const callbacks = useRef({ onEvent, onSignedOut });
  callbacks.current = { onEvent, onSignedOut };

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
      patch(wish.key, { status: "queued", error: undefined });
      emit({ type: "queued" });
      return;
    }
    patch(wish.key, { status: "sending", error: undefined });
    emit({ type: "sending" });
    try {
      const response = await fetch("/api/wishes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: wish.body,
          ...(wish.alias ? { authorName: wish.alias } : {}),
        }),
      });

      if (response.ok) {
        const saved: unknown = await response.json().catch(() => null);
        const posted = isPostedWish(saved) ? saved : null;
        // The live feed shows the guest's own wish at once, even before its feed has it (ADR-014).
        if (posted) rememberOwnPost({ kind: "wish", ...posted, savedAt: Date.now() });
        patch(wish.key, { status: "sent", id: posted?.id });
        emit({ type: "sent" });
        return;
      }
      const error = wishErrorId(response.status);
      patch(wish.key, { status: retryable(response.status) ? "failed" : "rejected", error });
      if (response.status === 401) callbacks.current.onSignedOut();
      emit({ type: "failed", error });
    } catch {
      if (isOffline()) {
        patch(wish.key, { status: "queued", error: undefined });
        emit({ type: "queued" });
      } else {
        patch(wish.key, { status: "failed", error: "wishes.error.network" });
        emit({ type: "failed", error: "wishes.error.network" });
      }
    }
  }, [patch]);

  const send = useCallback((body: string, alias: string) => {
    const wish: PendingWish = { key: nextKey(), body, alias, status: "sending" };
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
