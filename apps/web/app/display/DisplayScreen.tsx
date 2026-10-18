"use client";

/* Photos are immutable display derivatives from the media API, preloaded before they go up; a Next image proxy would add a hop. */
/* eslint-disable @next/next/no-img-element */

import type { LiveDisplayFeedResponse, LiveDisplayMessage, TranslationSegment } from "@grad/contract";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { browserApiOrigin, mediaDerivativeUrl } from "../../lib/api/browser-origin";
import { preloadImage, usePrefersReducedMotion, useWakeLock } from "../../lib/live/browser";
import {
  EMPTY_DISPLAY,
  applyDisplayMessage,
  applyFeedResponse,
  parseDisplayMessage,
  parseFeedResponse,
  pickNextSlide,
  recordShown,
  slideDurationMs,
  slidesOf,
  wishSize,
  type DisplayContent,
  type Slide,
} from "../../lib/live/display-feed";
import { LiveSocket, liveSocketUrl, type LiveSocketState } from "../../lib/live/live-socket";
import { captionFor } from "../../lib/live/segments";
import { BrandLogo } from "../logo/BrandLogo";
import { captionLanguage, type CaptionSetting } from "./caption-setting";

type Props = {
  eventName: string;
  eventDate: string | null;
  /** Server-rendered by our own QR renderer, never user input. */
  wishesQrSvg: string;
  wishesLink: string;
  liveLink: string;
  captions: CaptionSetting;
};

type Action = { type: "message"; message: LiveDisplayMessage } | { type: "feed"; response: LiveDisplayFeedResponse };

function reducer(state: DisplayContent, action: Action): DisplayContent {
  return action.type === "message" ? applyDisplayMessage(state, action.message) : applyFeedResponse(state, action.response);
}

type Link = "connecting" | "live" | "reconnecting" | "offline";

const LINK_LABEL: Record<Link, string> = {
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
  offline: "Offline, showing the last update",
};

function linkOf(state: LiveSocketState): Link {
  if (state.phase === "open") return "live";
  if (state.phase === "stopped") return "connecting";
  if (state.failures >= 3 || (typeof navigator !== "undefined" && navigator.onLine === false)) return "offline";
  return state.everOpened ? "reconnecting" : "connecting";
}

/** Nothing new for this long hides the caption band (the speaker paused, or translation stopped). */
const CAPTION_IDLE_MS = 45_000;
/** A photo that failed to load is skipped for this long, then tried again. */
const SKIP_MS = 5 * 60_000;
/** Matches --motion-slow plus a frame, so the leaving slide is gone once its fade ends. */
const CROSSFADE_MS = 520;

/**
 * Feed connection: socket first, then the HTTP catch-up on every open, applied
 * idempotently (contract `liveDisplayMessageSchema`). An attempt that never
 * opens also probes the catch-up endpoint: that tells a sign-in problem
 * (401/404/410) from a network one, and keeps the screen current over plain
 * HTTP if only WebSockets are blocked on the venue network.
 */
function useDisplayFeed() {
  const [content, dispatch] = useReducer(reducer, EMPTY_DISPLAY);
  const [link, setLink] = useState<Link>("connecting");
  const [problem, setProblem] = useState<"signin" | "expired" | null>(null);
  const untilRef = useRef<string | null>(null);
  const syncedRef = useRef(false);

  useEffect(() => {
    untilRef.current = content.until;
  }, [content.until]);

  useEffect(() => {
    const origin = browserApiOrigin();
    let request: AbortController | null = null;
    let disposed = false;

    const catchUp = async () => {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      const url = new URL("/live/display/feed", origin);
      // Only diffs once the full state has been applied; before that, ask for everything.
      if (syncedRef.current && untilRef.current) url.searchParams.set("since", untilRef.current);
      try {
        const response = await fetch(url, { credentials: "include", cache: "no-store", signal: controller.signal });
        if (disposed) return;
        if (response.status === 401 || response.status === 404) return setProblem("signin");
        if (response.status === 410) return setProblem("expired");
        if (!response.ok) return;
        const body = parseFeedResponse(await response.json());
        if (!body || disposed) return;
        syncedRef.current = true;
        setProblem(null);
        dispatch({ type: "feed", response: body });
      } catch {
        // Offline or aborted: keep showing what is on screen.
      } finally {
        if (request === controller) request = null;
      }
    };

    const socket = new LiveSocket({
      url: liveSocketUrl("/live/display", origin),
      // The API sends a keepalive about every 25 s; nearly three missed means the socket is dead.
      idleTimeoutMs: 70_000,
      onMessage: (data) => {
        const message = parseDisplayMessage(data);
        if (message) dispatch({ type: "message", message });
      },
      onOpen: () => void catchUp(),
      onClose: ({ opened }) => {
        if (!opened) void catchUp();
      },
      onStateChange: (state) => setLink(linkOf(state)),
    });
    socket.start();

    const online = () => socket.reconnectNow();
    const visible = () => {
      if (document.visibilityState === "visible") socket.reconnectNow();
    };
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    return () => {
      disposed = true;
      socket.stop();
      request?.abort();
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);

  return { content, link, problem };
}

/**
 * Rotates slides with one timer. Photos are preloaded (and the preload
 * cancelled if superseded) before they replace what is on screen; a slide a
 * moderator hides leaves at once. At most two slides are in the DOM: the
 * current one and, during a crossfade, the one leaving.
 */
function useSlideshow(slides: Slide[], reduced: boolean) {
  const [stage, setStage] = useState<{ current: Slide | null; leaving: Slide | null }>({ current: null, leaving: null });
  const slidesRef = useRef(slides);
  const reducedRef = useRef(reduced);
  const currentRef = useRef<Slide | null>(null);
  const shownRef = useRef(new Map<string, number>());
  const skipRef = useRef(new Map<string, number>());
  const advanceRef = useRef<() => void>(() => {});

  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let preload: AbortController | null = null;
    let tick = 0;

    const schedule = (ms: number) => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        // Hidden tab (a phone in a pocket): hold the slide, check again shortly.
        if (document.visibilityState === "hidden") schedule(2_000);
        else advance();
      }, ms);
    };

    const show = (slide: Slide | null) => {
      const previous = currentRef.current;
      currentRef.current = slide;
      if (slide) {
        tick += 1;
        shownRef.current = recordShown(shownRef.current, slide.key, tick, slidesRef.current);
      }
      const leaving = reducedRef.current || !previous || previous.key === slide?.key ? null : previous;
      setStage({ current: slide, leaving });
      if (slide) schedule(slideDurationMs(slide));
      else if (timer !== null) clearTimeout(timer);
    };

    const skipped = () => {
      const now = Date.now();
      for (const [key, until] of skipRef.current) if (until <= now) skipRef.current.delete(key);
      return new Set(skipRef.current.keys());
    };

    const advance = () => {
      preload?.abort();
      preload = null;
      const next = pickNextSlide(slidesRef.current, currentRef.current?.key ?? null, shownRef.current, skipped());
      if (!next || next.kind === "wish" || next.key === currentRef.current?.key) return show(next);
      const controller = new AbortController();
      preload = controller;
      preloadImage(mediaDerivativeUrl(next.photo.publicId, "display"), controller.signal)
        .then(() => {
          if (preload !== controller) return;
          preload = null;
          show(next);
        })
        .catch(() => {
          if (preload !== controller) return;
          preload = null;
          skipRef.current.set(next.key, Date.now() + SKIP_MS);
          advance();
        });
    };

    advanceRef.current = advance;
    advance();
    return () => {
      advanceRef.current = () => {};
      if (timer !== null) clearTimeout(timer);
      preload?.abort();
    };
  }, []);

  useEffect(() => {
    slidesRef.current = slides;
    const keys = new Set(slides.map((s) => s.key));
    for (const key of skipRef.current.keys()) if (!keys.has(key)) skipRef.current.delete(key);
    const current = currentRef.current;
    // First content, or the slide on screen was hidden by a moderator: move on now.
    if (!current || !keys.has(current.key)) advanceRef.current();
  }, [slides]);

  useEffect(() => {
    if (!stage.leaving) return;
    const t = setTimeout(() => setStage((s) => (s.leaving ? { ...s, leaving: null } : s)), CROSSFADE_MS);
    return () => clearTimeout(t);
  }, [stage.leaving]);

  return stage;
}

function SlideView({ slide, leaving = false }: { slide: Slide; leaving?: boolean }) {
  const className = `display-slide${leaving ? " display-slide--leaving" : ""}`;
  if (slide.kind === "photo") {
    return (
      <figure className={`${className} display-photo`} aria-hidden={leaving || undefined}>
        <img className="display-photo__img" src={mediaDerivativeUrl(slide.photo.publicId, "display")} alt="A photo from the guest camera" />
      </figure>
    );
  }
  const { wish } = slide;
  return (
    <figure className={`${className} display-wish display-wish--${wishSize(wish.body)}`} aria-hidden={leaving || undefined}>
      <blockquote className="display-wish__body">
        <p>“{wish.body}”</p>
      </blockquote>
      <figcaption className="display-wish__author">{wish.authorName}</figcaption>
    </figure>
  );
}

function CaptionBand({ segments, setting, liveLink }: { segments: TranslationSegment[]; setting: Exclude<CaptionSetting, "off">; liveLink: string }) {
  const lines = segments.slice(-2).map((segment) => captionFor(segment, captionLanguage(setting, segment.sourceLanguage)));
  return (
    <section className="display-captions" aria-label="Live captions">
      {lines.map((line, i) => (
        <p
          key={line.key}
          lang={line.language}
          className={`display-captions__line${i < lines.length - 1 ? " display-captions__line--previous" : ""} display-captions__line--${line.tone}`}
        >
          {line.tone === "failed" ? "Translation unavailable for this sentence." : line.text}
        </p>
      ))}
      <p className="display-captions__hint">Captions in Deutsch, English and Tiếng Việt on your phone: {liveLink}</p>
    </section>
  );
}

export function DisplayScreen({ eventName, eventDate, wishesQrSvg, wishesLink, liveLink, captions }: Props) {
  const reduced = usePrefersReducedMotion();
  useWakeLock(true);
  const { content, link, problem } = useDisplayFeed();
  // Keepalives only move `until`; the deck changes only with wishes and photos.
  const { wishes, photos } = content;
  const slides = useMemo(() => slidesOf({ wishes, photos }), [wishes, photos]);
  const stage = useSlideshow(slides, reduced);

  // The caption band shows while segments keep coming and hides after a pause.
  const latestCaption = content.captions[content.captions.length - 1];
  const [captionsFresh, setCaptionsFresh] = useState(false);
  useEffect(() => {
    if (!latestCaption) return;
    setCaptionsFresh(true);
    const t = setTimeout(() => setCaptionsFresh(false), CAPTION_IDLE_MS);
    return () => clearTimeout(t);
  }, [latestCaption]);
  const showCaptions = captions !== "off" && captionsFresh && content.captions.length > 0;
  const captionSetting = captions === "off" ? "auto" : captions;

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "f" && !event.metaKey && !event.ctrlKey && !event.altKey) toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen]);

  return (
    <div className={`display${showCaptions ? " display--captions" : ""}`}>
      <h1 className="brand-sr-only">{eventName}: event display</h1>
      <header className="display-top">
        <div className="display-brand">
          <span className="display-mark">
            <BrandLogo variant="compact" tone="on-blue" alt="" />
          </span>
          <span className="display-event">{eventName}</span>
        </div>
        <div className="display-top__end">
          <button type="button" className="display-fullscreen" onClick={toggleFullscreen}>
            Full screen (F)
          </button>
          <p className="display-status" data-link={link} role="status">
            <span className="display-status__dot" aria-hidden="true" />
            {LINK_LABEL[link]}
          </p>
        </div>
      </header>

      <main className="display-stage">
        {stage.current ? (
          <>
            {stage.leaving ? <SlideView key={`leaving-${stage.leaving.key}`} slide={stage.leaving} leaving /> : null}
            <SlideView key={stage.current.key} slide={stage.current} />
          </>
        ) : (
          <div className="display-slide display-empty">
            <p className="display-empty__kicker">Welcome to</p>
            <p className="display-empty__title">{eventName}</p>
            {eventDate ? <p className="display-empty__date">{eventDate}</p> : null}
            <p className="display-empty__lead">Scan the code to leave a wish. It appears on this screen in a moment.</p>
          </div>
        )}
      </main>

      <aside className="display-share" aria-labelledby="display-share-title">
        <a className="display-qr" href="/wishes" aria-label={`Leave a wish at ${wishesLink}`} dangerouslySetInnerHTML={{ __html: wishesQrSvg }} />
        <div className="display-share__text">
          <p id="display-share-title" className="display-share__title">Share your wishes</p>
          <p className="display-share__link">{wishesLink}</p>
        </div>
      </aside>

      {showCaptions ? <CaptionBand segments={content.captions} setting={captionSetting} liveLink={liveLink} /> : null}

      {problem ? (
        <p className="display-problem" role="alert">
          {problem === "expired"
            ? "This screen's invitation has expired. Open a current kiosk invitation link in this browser, then reload."
            : "This screen is not signed in. Open the kiosk invitation link once in this browser, then reload."}
        </p>
      ) : null}
    </div>
  );
}
