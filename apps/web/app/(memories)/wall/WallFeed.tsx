"use client";

/* Gallery derivatives are already resized, immutable JPEGs from the media API; a Next image proxy would add an unnecessary hop. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type SyntheticEvent } from "react";
import { Cta, PillGroup, PillToggle } from "@grad/ui";
import type { GalleryItem } from "../../../data/gallery";
import { formatRich, sliceTranslator, type MessageSlice } from "../../../lib/i18n/format";
import { useLiveGallery } from "../../../lib/live/use-live-gallery";
import { nextTrapIndex } from "../../site/nav";
import type { LocalItem, LocalPhoto, LocalWish } from "../gallery/local-items";
import { arrivals, seenFrom, type FeedSeen } from "../gallery/locket-logic";
import { PrintRequest, usePrintAvailability } from "../gallery/PrintRequest";
import { filterWall, localShown, wallHref, withoutListed, type WallMode, type WallShow } from "./wall-logic";
import "../gallery/gallery.css";

/** `pickMessages(locale, "wall.", "gallery.", "print.")`: the feed, its states and the print action (#9). */
type FeedMessages = MessageSlice<"wall." | "gallery." | "print.">;

/** What Tab cycles through inside the photo dialog. */
const DIALOG_FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Photos above the fold load eagerly (one column on a phone, so the first two). */
const EAGER_PHOTOS = 2;

/** The feed counts as "being read" once its top has scrolled under the 72px header. */
const READING_OFFSET_PX = 72;

const FILTERS: readonly WallShow[] = ["all", "wishes", "photos"];

/** The 640px thumb of a photo whose `content` is its display derivative (`/media/{id}/display`). */
function thumbOf(displayUrl: string): string {
  return displayUrl.replace(/\/display$/, "/thumb");
}

/**
 * The wall's one live feed (ADR-019): wishes as quote cards and photos as instant-photo cards,
 * newest first, filtered by the All · Wishes · Photos chips. What this visitor just sent sits on
 * top (`local`) until the feed lists it. Arrivals are held behind "N new posts" while the visitor
 * reads further down; photos open in a modal dialog with the experimental print request (#74).
 */
export function WallFeed({
  messages,
  intl,
  show,
  mode,
  onShow,
  local = [],
}: {
  messages: FeedMessages;
  intl: string;
  show: WallShow;
  /** The composer's mode, only to keep it in the retry link. */
  mode: WallMode;
  onShow: (show: WallShow) => void;
  local?: LocalItem[];
}) {
  const t = useMemo(() => sliceTranslator(messages), [messages]);
  const [isMounted, setIsMounted] = useState(false);
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);

  // Live (ADR-014): first paint from the BFF, then every new wish, photo and takedown as it happens,
  // plus this visitor's own posts (a photo shows as "developing" or "waiting for approval").
  const { items: all, link, isLoading, failed, isPartial } = useLiveGallery();
  const printAvailability = usePrintAvailability();

  const titleRef = useRef<HTMLHeadingElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const closeBarRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // New arrivals go in at the front. While the visitor reads further down they are held behind
  // an "N new posts" button instead, so nothing moves under their eyes; at the top of the feed
  // (or back there) they go straight in. Own posts are never held.
  const [held, setHeld] = useState<ReadonlySet<string>>(() => new Set());
  const seenRef = useRef<FeedSeen | null>(null);
  const readingFeed = () => {
    const feed = feedRef.current;
    return !!feed && feed.getBoundingClientRect().top < READING_OFFSET_PX;
  };
  useEffect(() => {
    if (isLoading) return;
    if (!seenRef.current) {
      seenRef.current = seenFrom(all);
      return;
    }
    const { hold } = arrivals(all, seenRef.current, readingFeed());
    if (hold.length > 0) setHeld((current) => new Set([...current, ...hold]));
  }, [all, isLoading]);
  useEffect(() => {
    if (held.size === 0) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!readingFeed()) setHeld(new Set());
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [held.size]);
  const showNew = () => {
    setHeld(new Set());
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    titleRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    titleRef.current?.focus({ preventScroll: true });
  };

  const shown = filterWall(all, show);
  const listed = shown.filter((item) => !held.has(item.id));
  const heldShown = shown.length - listed.length;
  // A local item the feed already carries (listed, or as the visitor's own pending post) is shown once.
  const mine = withoutListed(local, new Set(all.map((item) => item.id))).filter((item) => localShown(item.kind, show));

  // Dialog (QA P1-1): a modal <dialog>, so the page behind is inert; Tab is trapped inside,
  // Escape closes it, the close button takes focus and focus returns to the card on close.
  useLayoutEffect(() => {
    if (!selectedItem) return;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    closeBarRef.current?.querySelector("button")?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      lastFocusRef.current?.focus();
    };
  }, [selectedItem]);

  const closeItem = () => setSelectedItem(null);

  const onDialogKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab") return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE));
    const next = nextTrapIndex(items.length, items.indexOf(document.activeElement as HTMLElement), event.shiftKey);
    if (next < 0) return;
    event.preventDefault();
    items[next].focus();
  };

  // Escape: the browser fires `cancel`; close through state so React unmounts the dialog.
  const onDialogCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    closeItem();
  };

  const openItem = (item: GalleryItem) => {
    lastFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedItem(item);
  };

  const formatTime = (isoString: string) => {
    if (!isMounted) return "--:--";
    return new Date(isoString).toLocaleTimeString(intl, { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  const photoAlt = (item: GalleryItem) => t("gallery.photoAlt", { time: formatTime(item.timestamp) });
  const empty = show === "photos" ? "gallery.photos.empty" : show === "wishes" ? "gallery.wishes.empty" : "wall.feed.empty";

  const status = isLoading ? (
    <p role="status" className="mem-status wall-feed-status">{t("wall.feed.loading")}</p>
  ) : failed ? (
    <p role="alert" className="mem-status mem-status--error wall-feed-status">
      {formatRich(t("wall.feed.unavailable"), {
        retry: <a className="feed-link" href={wallHref(mode, show)}>{t("gallery.tryAgain")}</a>,
      })}
    </p>
  ) : listed.length === 0 && mine.length === 0 ? (
    <p className="mem-status wall-feed-status">{t(empty)}</p>
  ) : null;

  return (
    <>
      <div className="wall-feed-head">
        <h2 id="wall-feed-title" ref={titleRef} tabIndex={-1} className="feed-title wall-feed-title">{t("wall.feed.title")}</h2>
        <PillGroup as="toggle" tone="on-white" label={t("wall.filter.label")}>
          {FILTERS.map((filter) => (
            <PillToggle key={filter} pressed={show === filter} onClick={() => onShow(filter)}>{t(`wall.filter.${filter}`)}</PillToggle>
          ))}
        </PillGroup>
      </div>

      {/* Only when the live feed is down, never while it works (polling included). */}
      {link === "offline" && !failed && !isLoading ? <p role="status" className="mem-status wall-feed-status feed-offline">{t("gallery.offline")}</p> : null}
      {isPartial ? <p role="status" className="mem-status mem-status--notice wall-feed-status feed-notice">{t("gallery.partial")}</p> : null}

      <div className="feed" ref={feedRef}>
        {heldShown > 0 ? (
          <div className="feed-new">
            <button type="button" className="feed-new__button" onClick={showNew}>{t.plural("wall.newPosts", heldShown)}</button>
          </div>
        ) : null}

        {mine.length > 0 || listed.length > 0 ? (
          <ul className="wall-grid" aria-labelledby="wall-feed-title">
            {mine.map((item) => (item.kind === "photo" ? <LocalPhotoCard key={item.key} item={item} /> : <LocalWishCard key={item.key} item={item} />))}
            {listed.map((item, index) =>
              item.type === "WISH" ? (
                <li key={item.id} className="wall-card wall-wish">
                  <p className="wall-wish__body">{item.content}</p>
                  <p className="wall-meta">
                    <span className="wall-meta__author">{item.sender ?? t("gallery.anonymous")}</span>
                    <time className="wall-meta__time" dateTime={item.timestamp}>{formatTime(item.timestamp)}</time>
                  </p>
                </li>
              ) : item.pending ? (
                // The visitor's own shot, from its local preview: processing, or waiting for an organizer's approval.
                <li key={item.id} className={`wall-card wall-photo wall-photo--${item.pending}`}>
                  <div className="wall-photo__frame">
                    <img src={item.content} alt={t(item.pending === "waiting" ? "wall.waitingAlt" : "gallery.developingAlt")} />
                    <p className="wall-photo__status">{t(item.pending === "waiting" ? "wall.waiting" : "gallery.developing")}</p>
                  </div>
                  <p className="wall-meta">
                    {item.pending === "waiting" ? <span className="wall-meta__note">{t("wall.waitingNote")}</span> : <span className="wall-meta__author">{t("wall.you")}</span>}
                  </p>
                </li>
              ) : (
                <li key={item.id} className="wall-card wall-photo">
                  <button type="button" className="wall-photo__open" onClick={() => openItem(item)} aria-label={photoAlt(item)}>
                    <span className="wall-photo__frame">
                      <img
                        src={thumbOf(item.content)}
                        srcSet={`${thumbOf(item.content)} 640w, ${item.content} 2048w`}
                        sizes="(max-width: 960px) 100vw, 25vw"
                        alt=""
                        loading={index < EAGER_PHOTOS ? "eager" : "lazy"}
                        decoding="async"
                      />
                    </span>
                  </button>
                  <p className="wall-meta">
                    <span className="wall-meta__author">{t("gallery.anonymous")}</span>
                    <time className="wall-meta__time" dateTime={item.timestamp}>{formatTime(item.timestamp)}</time>
                  </p>
                </li>
              ),
            )}
          </ul>
        ) : null}
        {status}
      </div>
      {selectedItem && (
        <dialog
          ref={dialogRef}
          className="gal-dialog-backdrop"
          aria-label={photoAlt(selectedItem)}
          onCancel={onDialogCancel}
          onKeyDown={onDialogKeyDown}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeItem();
          }}
        >
          <div className="gal-dialog">
            <div className="gal-dialog-bar" ref={closeBarRef}>
              <time className="gal-dialog-time" dateTime={selectedItem.timestamp}>{formatTime(selectedItem.timestamp)}</time>
              <Cta tone="on-white" variant="secondary" onClick={closeItem}>{t("gallery.close")}</Cta>
            </div>
            <img src={selectedItem.content} alt={photoAlt(selectedItem)} className="gal-dialog-img" />
            {selectedItem.publicId ? (
              <PrintRequest key={selectedItem.publicId} publicId={selectedItem.publicId} availability={printAvailability} t={t} />
            ) : null}
          </div>
        </dialog>
      )}
    </>
  );
}

/** A photo this visitor just sent: the capture itself, its state, and Retry or Remove when it did not go. */
function LocalPhotoCard({ item }: { item: LocalPhoto }) {
  const action = item.actions[0];
  return (
    <li className={`wall-card wall-photo wall-photo--local is-${item.tone}`}>
      <div className="wall-photo__frame">
        <img src={item.url} alt={item.alt} />
        <p className="wall-photo__status">{item.status}</p>
      </div>
      {action ? (
        <button type="button" className="wall-photo__action" onClick={action.onClick}>{action.label}</button>
      ) : null}
    </li>
  );
}

/** A wish this visitor just sent, with its state and Retry or Edit when it did not go. */
function LocalWishCard({ item }: { item: LocalWish }) {
  return (
    <li className={`wall-card wall-wish wall-wish--local is-${item.tone}`}>
      <p className="wall-wish__body">{item.body}</p>
      <p className="wall-meta">
        <span className="wall-meta__author">{item.author}</span>
        <span className="wall-meta__status">{item.status}</span>
      </p>
      {item.actions.length > 0 ? (
        <div className="wall-wish__actions">
          {item.actions.map((action) => (
            <Cta key={action.label} tone="on-white" variant="secondary" onClick={action.onClick}>{action.label}</Cta>
          ))}
        </div>
      ) : null}
    </li>
  );
}
