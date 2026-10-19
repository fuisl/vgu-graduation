"use client";

/* Gallery derivatives are already resized, immutable JPEGs from the media API; a Next image proxy would add an unnecessary hop. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type SyntheticEvent } from "react";
import { Cta } from "@grad/ui";
import type { GalleryItem } from "../../../data/gallery";
import { formatRich, sliceTranslator, type MessageSlice, type SliceTranslator } from "../../../lib/i18n/format";
import { useLiveGallery } from "../../../lib/live/use-live-gallery";
import { nextTrapIndex } from "../../site/nav";
import type { LocalItem, LocalPhoto, LocalWish } from "./local-items";
import { arrivals, seenFrom, type FeedSeen } from "./locket-logic";
import { PrintRequest, usePrintAvailability } from "./PrintRequest";
import "./gallery.css";

/** `pickMessages(locale, "gallery.", "print.")`: the feed and its print action in the guest's language (#9). */
type GalleryMessages = MessageSlice<"gallery." | "print.">;
type T = SliceTranslator<keyof GalleryMessages>;

/** What Tab cycles through inside the photo dialog. */
const DIALOG_FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tiles above the fold on a phone (two rows of three) load eagerly. */
const EAGER_TILES = 6;

/** The feed counts as "being read" once its top has scrolled under the 72px header. */
const READING_OFFSET_PX = 72;

/** The 640px thumb of a photo whose `content` is its display derivative (`/media/{id}/display`). */
function thumbOf(displayUrl: string): string {
  return displayUrl.replace(/\/display$/, "/thumb");
}

/**
 * The live feed under the locket camera (`kind="photos"`, on /gallery) and under the wish
 * composer (`kind="wishes"`, on /wishes): newest first, with what this guest just sent on top
 * (`local`) until the listing includes it. Photos open in a modal dialog that also holds the
 * experimental print request (#74).
 */
export function GalleryView({
  kind,
  messages,
  intl,
  local = [],
}: {
  kind: "photos" | "wishes";
  messages: GalleryMessages;
  intl: string;
  local?: LocalItem[];
}) {
  const t = useMemo(() => sliceTranslator(messages), [messages]);
  const [isMounted, setIsMounted] = useState(false);
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);

  // Live (ADR-014): first paint from the BFF, then every new wish, photo and takedown as it happens,
  // plus the guest's own posts (a photo shows as "developing" until it is processed).
  const { items: galleryItems, link, isLoading, failed, isPartial } = useLiveGallery();

  // Guest print requests (#74): hidden unless the web flag is on; the API enforces its own.
  const printAvailability = usePrintAvailability();

  const titleRef = useRef<HTMLHeadingElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const closeBarRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const type = kind === "photos" ? "POLAROID" : "WISH";
  const all = useMemo(() => galleryItems.filter((item) => item.type === type), [galleryItems, type]);

  // New arrivals go in at the front. While the guest is reading further down the feed they are
  // held back behind an "N new" button instead, so nothing moves under their eyes; at the top of
  // the feed (or back there) they go straight in. Own posts are never held.
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

  const listed = all.filter((item) => !held.has(item.id));
  // A local item the feed already carries (listed, or as the guest's own developing post) is shown once.
  const allIds = new Set(all.map((item) => item.id));
  const mine = local.filter((item) => !(item.serverId && allIds.has(`${item.kind}-${item.serverId}`)));
  const loadError = failed;

  // Dialog (QA P1-1): a modal <dialog>, so the page behind is inert; Tab is trapped inside,
  // Escape closes it, the close button takes focus and focus returns to the tile on close.
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
  const titleId = `feed-${kind}-title`;
  const k = kind === "photos" ? "gallery.photos" : "gallery.wishes";

  const body = isLoading ? (
    <p role="status" className="mem-status">{t(`${k}.loading`)}</p>
  ) : loadError ? (
    <p role="alert" className="mem-status mem-status--error">
      {formatRich(t(`${k}.unavailable`), {
        retry: <a className="feed-link" href={kind === "photos" ? "/gallery" : "/wishes"}>{t("gallery.tryAgain")}</a>,
      })}
    </p>
  ) : listed.length === 0 && mine.length === 0 ? (
    <p className="mem-status">{t(`${k}.empty`)}</p>
  ) : null;

  return (
    <>
      <h2 id={titleId} ref={titleRef} tabIndex={-1} className="feed-title">{t(`${k}.title`)}</h2>

      {/* Only when the live feed is down, never while it works (polling included). */}
      {link === "offline" && !failed && !isLoading ? <p role="status" className="mem-status feed-offline">{t("gallery.offline")}</p> : null}
      {isPartial ? <p role="status" className="mem-status mem-status--notice feed-notice">{t("gallery.partial")}</p> : null}

      <div className="feed" ref={feedRef}>
        {held.size > 0 ? (
          <div className="feed-new">
            <button type="button" className="feed-new__button" onClick={showNew}>
              {t.plural(kind === "photos" ? "gallery.newPhotos" : "gallery.newWishes", held.size)}
            </button>
          </div>
        ) : null}

        {kind === "photos" ? (
          mine.length > 0 || listed.length > 0 ? (
            <ul className="feed-grid" aria-labelledby={titleId}>
              {(mine as LocalPhoto[]).map((item) => <LocalTile key={item.key} item={item} />)}
              {listed.map((item, index) =>
                item.pending === "developing" ? (
                  // The guest's own shot, from its local preview, until the processed photo arrives.
                  <li key={item.id} className="feed-tile feed-tile--developing">
                    <img src={item.content} alt={t("gallery.developingAlt")} />
                    <p className="feed-tile__status">{t("gallery.developing")}</p>
                  </li>
                ) : (
                  <li key={item.id} className="feed-tile">
                    <button type="button" className="feed-tile__open" onClick={() => openItem(item)}>
                      <img
                        src={thumbOf(item.content)}
                        srcSet={`${thumbOf(item.content)} 640w, ${item.content} 2048w`}
                        sizes="(max-width: 960px) 33vw, 20vw"
                        alt={photoAlt(item)}
                        loading={index < EAGER_TILES ? "eager" : "lazy"}
                        decoding="async"
                      />
                    </button>
                  </li>
                ),
              )}
            </ul>
          ) : null
        ) : mine.length > 0 || listed.length > 0 ? (
          <ul className="feed-wishes" aria-labelledby={titleId}>
            {(mine as LocalWish[]).map((item) => <LocalWishRow key={item.key} item={item} />)}
            {listed.map((item) => (
              <li key={item.id} className="feed-wish">
                <p className="feed-wish__body">{item.content}</p>
                <p className="feed-wish__meta">
                  <span className="feed-wish__author">{item.sender ?? t("gallery.anonymous")}</span>
                  <time className="feed-wish__time" dateTime={item.timestamp}>{formatTime(item.timestamp)}</time>
                </p>
              </li>
            ))}
          </ul>
        ) : null}
        {body}
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

/** A photo this guest just sent: the capture itself, its state, and Retry or Remove when it did not go. */
function LocalTile({ item }: { item: LocalPhoto }) {
  const action = item.actions[0];
  return (
    <li className={`feed-tile feed-tile--local is-${item.tone}`}>
      <img src={item.url} alt={item.alt} />
      <p className="feed-tile__status">{item.status}</p>
      {action ? (
        <button type="button" className="feed-tile__action" onClick={action.onClick}>{action.label}</button>
      ) : null}
    </li>
  );
}

/** A wish this guest just sent, with its state and Retry or Edit when it did not go. */
function LocalWishRow({ item }: { item: LocalWish }) {
  return (
    <li className={`feed-wish feed-wish--local is-${item.tone}`}>
      <p className="feed-wish__body">{item.body}</p>
      <p className="feed-wish__meta">
        <span className="feed-wish__author">{item.author}</span>
        <span className="feed-wish__status">{item.status}</span>
      </p>
      {item.actions.length > 0 ? (
        <div className="feed-wish__actions">
          {item.actions.map((action) => (
            <Cta key={action.label} tone="on-white" variant="secondary" onClick={action.onClick}>{action.label}</Cta>
          ))}
        </div>
      ) : null}
    </li>
  );
}
