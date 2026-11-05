"use client";

import Image, { getImageProps } from "next/image";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BrandEyebrow, Cta } from "@grad/ui";
import type { Locale } from "../../lib/i18n/config";
import { sliceTranslator, type MessageSlice } from "../../lib/i18n/format";
import { INITIAL_SELECTION, selectEntry, selectPhoto, stepEntry } from "./selection";
import type { JourneyEntryView } from "./view";

type Messages = MessageSlice<"landing.journey.ui.">;
type Translate = ReturnType<typeof sliceTranslator<keyof Messages>>;

/** A plate is half the page from the breakpoint up, and the whole phone below it. */
const PLATE_SIZES = "(max-width: 960px) 100vw, 50vw";

/**
 * The journey list. One DOM for both layouts: each row is followed by its panel, so on a phone the panel opens
 * in place, and from the breakpoint up journey.css places the rows in the left column and the one open panel in
 * the right. Every panel is server-rendered; without JavaScript journey.css shows them all.
 */
export function JourneyList({ entries, messages, locale }: { entries: JourneyEntryView[]; messages: Messages; locale: Locale }) {
  const t = useMemo(() => sliceTranslator(messages), [messages]);
  const [selection, setSelection] = useState(INITIAL_SELECTION);
  const [announcement, setAnnouncement] = useState("");
  const root = useRef<HTMLDivElement>(null);
  // Set by a click and read once the new panel has rendered.
  const anchor = useRef<{ row: HTMLElement; top: number } | null>(null);
  const focusAfter = useRef<"previous" | "next" | null>(null);

  useLayoutEffect(() => {
    // Stop the film when the guest moves on: a hidden video keeps playing.
    root.current?.querySelectorAll("video").forEach((video) => {
      if (video.closest("[hidden]")) video.pause();
    });
    // The panel above a row may have just closed: keep the tapped row under the finger.
    if (anchor.current) {
      const { row, top } = anchor.current;
      anchor.current = null;
      const moved = row.getBoundingClientRect().top - top;
      if (moved !== 0) window.scrollBy({ top: moved, behavior: "instant" });
    }
    // ← and Next → live in the panel that has just been hidden: keep focus on the same control in the new one.
    if (focusAfter.current) {
      const which = focusAfter.current;
      focusAfter.current = null;
      root.current?.querySelector<HTMLElement>(`#journey-panel-${selection.entry} [data-journey-nav="${which}"] button`)?.focus();
    }
  }, [selection.entry]);

  const step = (delta: 1 | -1) => {
    const next = stepEntry(selection, delta, entries.length);
    focusAfter.current = delta === 1 ? "next" : "previous";
    setSelection(next);
    setAnnouncement(entries[next.entry]?.title ?? "");
  };

  return (
    <div className="journey" ref={root}>
      <ol className="journey-list" style={{ "--journey-count": entries.length } as CSSProperties}>
        {entries.map((entry, index) => {
          const open = index === selection.entry;
          return (
            <li className="journey-entry" key={entry.file}>
              <button
                type="button"
                className="journey-row"
                aria-expanded={open}
                aria-controls={`journey-panel-${index}`}
                onClick={(event) => {
                  anchor.current = { row: event.currentTarget, top: event.currentTarget.getBoundingClientRect().top };
                  setSelection((current) => selectEntry(current, index, entries.length));
                  setAnnouncement("");
                }}
              >
                <span className="journey-row__stripe" />
                <span className="journey-row__thumb">
                  {entry.thumb ? (
                    <Image src={entry.thumb} alt="" fill sizes="(max-width: 960px) 60px, 116px" className="journey-row__image" />
                  ) : (
                    <span className="journey-row__kind" aria-hidden="true">{t(entry.video ? "landing.journey.ui.kind.video" : "landing.journey.ui.kind.photo")}</span>
                  )}
                </span>
                <span className="journey-row__file" translate="no">{entry.file}</span>
                <span className="brand-sr-only">{entry.title}</span>
              </button>
              <div id={`journey-panel-${index}`} className="journey-panel" hidden={!open}>
                {entry.video ? (
                  <Film video={entry.video} locale={locale} t={t} />
                ) : (
                  <Photos
                    photos={entry.photos}
                    current={open ? selection.photo : 0}
                    open={open}
                    onPick={(photo) => setSelection((now) => selectPhoto(now, photo, entry.photos.length))}
                    t={t}
                  />
                )}
                <div className="journey-heading">
                  <h3 className="journey-panel__title">{entry.title}</h3>
                  <div className="journey-nav">
                    <span data-journey-nav="previous">
                      <Cta tone="on-white" variant="secondary" aria-label={t("landing.journey.ui.previous")} onClick={() => step(-1)}>←</Cta>
                    </span>
                    <span data-journey-nav="next">
                      <Cta tone="on-white" variant="secondary" onClick={() => step(1)}>
                        {t("landing.journey.ui.next")}<span className="journey-nav__arrow" aria-hidden="true">→</span>
                      </Cta>
                    </span>
                  </div>
                </div>
                <BrandEyebrow>{entry.date}</BrandEyebrow>
                <p className="journey-panel__story">{entry.story}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {/* The panel changes under a focused ← or Next → without any other announcement. */}
      <p className="brand-sr-only" role="status">{announcement}</p>
    </div>
  );
}

function Plate({ label }: { label: string }) {
  return (
    <div className="journey-plate">
      <BrandEyebrow>{label}</BrandEyebrow>
    </div>
  );
}

function Film({ video, locale, t }: { video: NonNullable<JourneyEntryView["video"]>; locale: Locale; t: Translate }) {
  const [failed, setFailed] = useState(false);
  if (!video.src) return <div className="journey-media"><Plate label={t("landing.journey.ui.empty.video")} /></div>;
  if (failed) return <div className="journey-media"><Plate label={t("landing.journey.ui.videoFailed")} /></div>;
  // A <video> poster is a plain URL: ask the image optimizer for one sized like the plate.
  const poster = video.poster ? getImageProps({ src: video.poster, alt: "", width: 640, height: 360 }).props.src : undefined;
  return (
    <div className="journey-media">
      <video className="journey-video" controls preload="none" playsInline poster={poster} src={video.src} aria-label={video.label} onError={() => setFailed(true)}>
        {video.captions.en ? <track kind="captions" src={video.captions.en} srcLang="en" label={t("landing.journey.ui.captions.en")} default={locale === "en"} /> : null}
        {video.captions.vi ? <track kind="captions" src={video.captions.vi} srcLang="vi" label={t("landing.journey.ui.captions.vi")} default={locale === "vi"} /> : null}
        <a href={video.src}>{t("landing.journey.ui.videoFallback")}</a>
      </video>
    </div>
  );
}

function Photos({ photos, current, open, onPick, t }: {
  photos: JourneyEntryView["photos"];
  current: number;
  open: boolean;
  onPick: (photo: number) => void;
  t: Translate;
}) {
  const total = photos.length;
  // A chapter with no photos listed still keeps its place on the page.
  if (total === 0) return <div className="journey-media"><Plate label={t("landing.journey.ui.empty.photo", { number: 1, total: 1 })} /></div>;
  return (
    <>
      <div className="journey-photos">
        {photos.map((photo, index) => (
          <div className="journey-media" key={index} hidden={index !== current}>
            {photo.src ? (
              // Only the open entry's main photo loads at once; everything else waits until it is seen.
              <Image src={photo.src} alt={photo.alt} fill sizes={PLATE_SIZES} className="journey-media__image" loading={open && index === current ? "eager" : "lazy"} />
            ) : (
              <Plate label={t("landing.journey.ui.empty.photo", { number: index + 1, total })} />
            )}
          </div>
        ))}
      </div>
      {total > 1 ? (
        <div className="journey-flashbacks" role="group" aria-label={t("landing.journey.ui.photos")}>
          {photos.map((photo, index) => (
            <button
              key={index}
              type="button"
              className="journey-flashback"
              aria-pressed={index === current}
              aria-label={t("landing.journey.ui.photoLabel", { number: index + 1, total })}
              onClick={() => onPick(index)}
            >
              {photo.src ? <Image src={photo.src} alt="" fill sizes="64px" className="journey-flashback__image" /> : index + 1}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
