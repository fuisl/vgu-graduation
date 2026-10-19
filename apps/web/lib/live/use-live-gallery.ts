"use client";

import type { LiveGalleryFeedResponse, LiveGalleryMessage } from "@grad/contract";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { buildGalleryItems, type GalleryItem } from "../../data/gallery";
import { browserApiOrigin } from "../api/browser-origin";
import { OWN_POSTS_EVENT, forgetOwnPosts, mergeOwnPosts, readOwnPosts, type OwnPost } from "../memories/own-posts";
import {
  EMPTY_LIVE_GALLERY,
  LiveGallery,
  applyGalleryFeed,
  applyGalleryMessage,
  type LiveGalleryLink,
  type LiveGalleryState,
} from "./gallery-feed";

export interface LiveGalleryView {
  /** Newest first: the feed once synced, else the BFF's first paint; plus the guest's own pending posts. */
  items: GalleryItem[];
  /** Connection to the live feed, for an optional status line. */
  link: LiveGalleryLink;
  /** Nothing to show yet and still trying. */
  isLoading: boolean;
  /** Nothing to show and neither the BFF nor the feed answers. */
  failed: boolean;
  /** The first paint is missing photos or wishes and the feed has not filled them in yet. */
  isPartial: boolean;
}

type Action =
  | { type: "message"; message: LiveGalleryMessage }
  | { type: "feed"; response: LiveGalleryFeedResponse; snapshot: boolean };

function reducer(state: LiveGalleryState, action: Action): LiveGalleryState {
  return action.type === "message"
    ? applyGalleryMessage(state, action.message)
    : applyGalleryFeed(state, action.response, action.snapshot);
}

type FirstPaint = { status: "loading" } | { status: "ok"; items: GalleryItem[]; partial: boolean } | { status: "failed" };

function isFirstPaint(body: unknown): body is { items: GalleryItem[]; partial?: boolean } {
  return !!body && typeof body === "object" && "items" in body && Array.isArray((body as { items: unknown }).items);
}

/**
 * The gallery's data, live (ADR-014). Paints first from the BFF's short-cached
 * `/api/gallery` (which also survives a homelab outage), then follows
 * `WS /live/gallery` straight from the API: a wish or photo posted anywhere
 * appears within about a second, a moderator's takedown disappears as fast,
 * and the guest's own posts show at once (see `own-posts.ts`). Reconnects,
 * catches up and falls back to polling by itself (`LiveGallery`).
 */
export function useLiveGallery(): LiveGalleryView {
  const [live, dispatch] = useReducer(reducer, EMPTY_LIVE_GALLERY);
  const [first, setFirst] = useState<FirstPaint>({ status: "loading" });
  const [link, setLink] = useState<LiveGalleryLink>("connecting");
  const [own, setOwn] = useState<OwnPost[]>([]);
  const cursorRef = useRef<string | null>(null);
  useEffect(() => {
    cursorRef.current = live.synced ? live.until : null;
  }, [live.synced, live.until]);

  // First paint from the BFF.
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/gallery", { signal: controller.signal })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok || !isFirstPaint(body)) throw new Error("Invalid gallery response");
        setFirst({ status: "ok", items: body.items, partial: body.partial === true });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFirst({ status: "failed" });
      });
    return () => controller.abort();
  }, []);

  // The live feed.
  useEffect(() => {
    const gallery = new LiveGallery({
      apiOrigin: browserApiOrigin(),
      cursor: () => cursorRef.current,
      onMessage: (message) => dispatch({ type: "message", message }),
      onFeed: (response, snapshot) => dispatch({ type: "feed", response, snapshot }),
      onLink: setLink,
    });
    gallery.start();
    const online = () => gallery.refresh();
    const visible = () => {
      if (document.visibilityState === "visible") gallery.refresh();
    };
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    return () => {
      gallery.stop();
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);

  // The guest's own recent posts (this tab), re-read when one is added.
  useEffect(() => {
    const read = () => setOwn(readOwnPosts());
    read();
    window.addEventListener(OWN_POSTS_EVENT, read);
    return () => window.removeEventListener(OWN_POSTS_EVENT, read);
  }, []);

  const base = useMemo(() => {
    if (live.synced) {
      return buildGalleryItems({ items: live.photos, nextCursor: null }, { items: live.wishes, nextCursor: null }, browserApiOrigin());
    }
    return first.status === "ok" ? first.items : [];
  }, [live.synced, live.photos, live.wishes, first]);

  const merged = useMemo(() => mergeOwnPosts(base, own, live.synced), [base, own, live.synced]);

  // Own posts the feed now carries are no longer needed.
  useEffect(() => {
    if (merged.seen.length === 0) return;
    forgetOwnPosts(merged.seen);
    setOwn(readOwnPosts());
  }, [merged.seen]);

  const hasData = live.synced || first.status === "ok" || merged.items.length > 0;
  return {
    items: merged.items,
    link,
    isLoading: !hasData && !(first.status === "failed" && link === "offline"),
    failed: !hasData && first.status === "failed" && link === "offline",
    isPartial: !live.synced && first.status === "ok" && first.partial,
  };
}
