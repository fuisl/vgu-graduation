"use client";

import type { TargetLanguage, TranslationSegment } from "@grad/contract";
import { BrandEyebrow, Cta, PillGroup, PillToggle, Section } from "@grad/ui";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { browserApiOrigin } from "../../lib/api/browser-origin";
import { usePrefersReducedMotion, useWakeLock } from "../../lib/live/browser";
import { LiveSocket, liveSocketUrl, type LiveSocketState } from "../../lib/live/live-socket";
import { backfillAfter, captionFor, lastPosition, mergeSegments, segmentKey } from "../../lib/live/segments";
import {
  AnnouncementQueue,
  LANGUAGES,
  TEXT_SIZES,
  backlogUrl,
  defaultLanguage,
  parseBacklog,
  parseLanguage,
  parseTextSize,
  parseTranslationMessage,
  safeStorage,
  translationView,
  type TextSize,
  type TranslationView,
} from "../../lib/live/translation-feed";

const LANGUAGE_KEY = "grad26.live.language";
const SIZE_KEY = "grad26.live.textSize";
/** After a reconnect, re-read this many lines before the last one held, to pick up drafts that became final meanwhile. */
const REFETCH_OVERLAP = 5;
/** Within this distance of the bottom the page follows new captions. */
const FOLLOW_THRESHOLD_PX = 96;

const SIZE_LABEL: Record<TextSize, string> = { m: "Standard text", l: "Large text", xl: "Extra large text" };

const STATUS_LABEL: Record<TranslationView, string> = {
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
  unavailable: "Translation unavailable",
};

/**
 * Socket, catch-up and segment store. Missed segments are refetched over HTTP
 * after every reconnect (contract `translationBacklogQuerySchema`: by session
 * and sequence, which is gapless), and any gap seen on the live stream is
 * filled the same way, so a phone that joins mid-session gets recent context.
 */
function useTranslationFeed(onLiveSegment: (segment: TranslationSegment) => void) {
  const [segments, setSegments] = useState<TranslationSegment[]>([]);
  const [socketState, setSocketState] = useState<LiveSocketState>({ phase: "connecting", failures: 0, everOpened: false });
  const [service, setService] = useState<"unknown" | "live" | "unavailable">("unknown");
  const segmentsRef = useRef<TranslationSegment[]>([]);
  const onLiveRef = useRef(onLiveSegment);

  useEffect(() => {
    onLiveRef.current = onLiveSegment;
  }, [onLiveSegment]);

  useEffect(() => {
    const origin = browserApiOrigin();
    const inflight = new Map<string, AbortController>();
    let disposed = false;

    const apply = (incoming: TranslationSegment[]) => {
      segmentsRef.current = mergeSegments(segmentsRef.current, incoming);
      setSegments(segmentsRef.current);
    };

    const fetchBacklog = async (sessionId: string, after: number) => {
      const key = `${sessionId}:${after}`;
      if (inflight.has(key)) return;
      const controller = new AbortController();
      inflight.set(key, controller);
      try {
        const response = await fetch(backlogUrl(origin, sessionId, after), {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok || disposed) return;
        const backlog = parseBacklog(await response.json());
        if (backlog && !disposed) apply(backlog);
      } catch {
        // Offline or aborted: the next reconnect tries again.
      } finally {
        inflight.delete(key);
      }
    };

    const socket = new LiveSocket({
      url: liveSocketUrl("/live/translation", origin),
      onMessage: (data) => {
        const message = parseTranslationMessage(data);
        if (!message) return;
        if (message.type === "status") {
          setService(message.state);
          return;
        }
        setService("live");
        const after = backfillAfter(segmentsRef.current, message.segment);
        apply([message.segment]);
        const merged = segmentsRef.current.find((s) => segmentKey(s) === segmentKey(message.segment));
        if (merged) onLiveRef.current(merged);
        if (after !== null) void fetchBacklog(message.segment.sessionId, after);
      },
      onOpen: () => {
        const position = lastPosition(segmentsRef.current);
        if (position) void fetchBacklog(position.sessionId, Math.max(-1, position.sequence - REFETCH_OVERLAP));
      },
      onStateChange: (state) => {
        setSocketState(state);
        if (state.phase !== "open") setService((s) => (s === "unavailable" ? s : "unknown"));
      },
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
      for (const controller of inflight.values()) controller.abort();
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);

  return { segments, view: translationView(socketState, service) };
}

/** Screen-reader announcements of final lines, throttled through one timer. */
function useAnnouncer() {
  const [text, setText] = useState("");
  const queueRef = useRef(new AnnouncementQueue());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    timerRef.current = null;
    const next = queueRef.current.take(Date.now());
    if (next) setText(next);
    if (queueRef.current.hasPending) timerRef.current = setTimeout(flush, queueRef.current.waitMs(Date.now()));
  }, []);

  const announce = useCallback(
    (key: string, line: string) => {
      queueRef.current.push(key, line);
      if (timerRef.current === null) timerRef.current = setTimeout(flush, queueRef.current.waitMs(Date.now()));
    },
    [flush],
  );

  const clear = useCallback(() => queueRef.current.clear(), []);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  return { text, announce, clear };
}

export function LiveCaptions() {
  const [language, setLanguage] = useState<TargetLanguage>("en");
  const [size, setSize] = useState<TextSize>("m");
  const languageRef = useRef(language);
  const reduced = usePrefersReducedMotion();
  useWakeLock(true);
  const announcer = useAnnouncer();
  const { announce } = announcer;

  useEffect(() => {
    const stored = parseLanguage(safeStorage.get(LANGUAGE_KEY));
    const initial = stored ?? defaultLanguage(navigator.languages?.length ? navigator.languages : [navigator.language]);
    languageRef.current = initial;
    setLanguage(initial);
    setSize(parseTextSize(safeStorage.get(SIZE_KEY)) ?? "m");
  }, []);

  const onLiveSegment = useCallback(
    (segment: TranslationSegment) => {
      const caption = captionFor(segment, languageRef.current);
      if (caption.tone === "final") announce(`${caption.key}:${languageRef.current}`, caption.text);
    },
    [announce],
  );
  const { segments, view } = useTranslationFeed(onLiveSegment);

  const chooseLanguage = (code: TargetLanguage) => {
    languageRef.current = code;
    setLanguage(code);
    safeStorage.set(LANGUAGE_KEY, code);
    announcer.clear();
  };
  const chooseSize = (value: TextSize) => {
    setSize(value);
    safeStorage.set(SIZE_KEY, value);
  };

  // Follow the live edge unless the reader has scrolled up.
  const [following, setFollowing] = useState(true);
  const followingRef = useRef(true);
  const jumpUntilRef = useRef(0);
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (Date.now() < jumpUntilRef.current) return;
        const doc = document.documentElement;
        const next = doc.scrollHeight - (window.scrollY + window.innerHeight) < FOLLOW_THRESHOLD_PX;
        if (next !== followingRef.current) {
          followingRef.current = next;
          setFollowing(next);
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  useLayoutEffect(() => {
    if (followingRef.current && segments.length > 0) window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [segments, size, language]);

  const jumpToLive = () => {
    followingRef.current = true;
    setFollowing(true);
    jumpUntilRef.current = Date.now() + (reduced ? 0 : 800);
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  };

  const languageName = LANGUAGES.find((l) => l.code === language)?.name ?? "English";

  return (
    <>
      <main className="live-main">
        <Section tone="blue" density="compact" aria-labelledby="live-title">
          <div className="live-hero">
            <BrandEyebrow>Live translation / Experimental</BrandEyebrow>
            <h1 id="live-title" className="live-title">Live captions</h1>
            <p className="live-lead">The ceremony is spoken in English and Vietnamese. Read along in your language as it happens.</p>
            <p className="live-status" data-view={view} role="status">
              <span className="live-status__dot" aria-hidden="true" />
              {STATUS_LABEL[view]}
            </p>
          </div>
        </Section>

        <Section tone="white" density="compact" aria-labelledby="live-log-title">
          <h2 id="live-log-title" className="brand-sr-only">Captions in {languageName}</h2>
          {view === "unavailable" ? (
            <div className="live-notice">
              <p className="live-notice__title">Translation unavailable</p>
              <p className="live-notice__body">
                Live translation is paused or not running right now. The ceremony carries on as normal, and this page reconnects by itself when it is back.
              </p>
            </div>
          ) : null}
          {segments.length === 0 && view !== "unavailable" ? (
            <p className="live-empty" role="status">
              {view === "live" ? "Waiting for the first words. Captions appear here as the ceremony is spoken." : "Connecting to live captions…"}
            </p>
          ) : null}
          {segments.length > 0 ? (
            <ol className={`live-log live-log--${size}`} role="log" aria-live="off" aria-labelledby="live-log-title">
              {segments.map((segment) => {
                const caption = captionFor(segment, language);
                return (
                  <li key={caption.key} className={`live-line live-line--${caption.tone}`} lang={caption.language}>
                    {caption.tone === "failed" ? (
                      <>
                        <span className="live-line__note" lang="en">Translation unavailable for this sentence. Original:</span> {caption.text}
                      </>
                    ) : (
                      caption.text
                    )}
                    {caption.tone === "draft" || caption.tone === "pending" ? (
                      <span className="brand-sr-only" lang="en"> (still being translated)</span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : null}
        </Section>
      </main>

      <div className="live-dock">
        {!following && segments.length > 0 ? (
          <div className="live-dock__jump">
            <Cta tone="on-white" onClick={jumpToLive}>Jump to live</Cta>
          </div>
        ) : null}
        <div className="live-dock__controls">
          <PillGroup as="toggle" label="Caption language" tone="on-white">
            {LANGUAGES.map((l) => (
              <PillToggle key={l.code} pressed={language === l.code} onClick={() => chooseLanguage(l.code)} aria-label={l.name} title={l.name}>
                {l.label}
              </PillToggle>
            ))}
          </PillGroup>
          <PillGroup as="toggle" label="Text size" tone="on-white">
            {TEXT_SIZES.map((s) => (
              <PillToggle key={s} pressed={size === s} onClick={() => chooseSize(s)} aria-label={SIZE_LABEL[s]} title={SIZE_LABEL[s]}>
                <span className={`live-size-glyph live-size-glyph--${s}`} aria-hidden="true">Aa</span>
              </PillToggle>
            ))}
          </PillGroup>
        </div>
      </div>

      <div className="brand-sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcer.text}
      </div>
    </>
  );
}
