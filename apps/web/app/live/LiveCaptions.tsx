"use client";

import type { TargetLanguage, TranslationSegment } from "@grad/contract";
import { BrandEyebrow, Cta, PillGroup, PillToggle, Section } from "@grad/ui";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { browserApiOrigin } from "../../lib/api/browser-origin";
import { usePrefersReducedMotion, useWakeLock } from "../../lib/live/browser";
import { LiveSocket, liveSocketUrl, type LiveSocketState } from "../../lib/live/live-socket";
import { laterTimestamp } from "../../lib/live/guards";
import { captionFor, mergeSegments, segmentKey } from "../../lib/live/segments";
import {
  AnnouncementQueue,
  LANGUAGES,
  TEXT_SIZES,
  defaultLanguage,
  parseLanguage,
  parseTextSize,
  parseSegmentsPage,
  parseTranslationMessage,
  safeStorage,
  segmentsUrl,
  translationView,
  type ServiceState,
  type TextSize,
  type TranslationView,
} from "../../lib/live/translation-feed";

const LANGUAGE_KEY = "grad26.live.language";
const SIZE_KEY = "grad26.live.textSize";
/** Polling cadence while the socket is refused (the API's Retry-After is 5 s). */
const POLL_INTERVAL_MS = 5_000;
/** A long outage is caught up in at most this many pages of 200; older lines are not needed on screen. */
const MAX_CATCH_UP_PAGES = 3;
/** Segments within this long after connecting are the server's snapshot of recent lines. */
const SNAPSHOT_QUIET_MS = 1_500;
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
 * Socket, catch-up and segment store (protocol: contract `liveTranslationMessageSchema`).
 * On connect the API sends the status and the recent segments itself. After a
 * reconnect the page also fetches everything changed since the last `until`
 * it saw, so nothing missed while offline is lost. When the socket cannot open
 * (API over its connection cap answers 503, or a network that blocks
 * WebSockets) it polls the same endpoint every few seconds instead, and goes
 * back to the socket as soon as one opens.
 */
function useTranslationFeed(onLiveSegment: (segment: TranslationSegment) => void) {
  const [segments, setSegments] = useState<TranslationSegment[]>([]);
  const [socketState, setSocketState] = useState<LiveSocketState>({ phase: "connecting", failures: 0, everOpened: false });
  const [service, setService] = useState<ServiceState>("unknown");
  const [polling, setPolling] = useState(false);
  const onLiveRef = useRef(onLiveSegment);

  useEffect(() => {
    onLiveRef.current = onLiveSegment;
  }, [onLiveSegment]);

  useEffect(() => {
    const origin = browserApiOrigin();
    let segmentsHeld: TranslationSegment[] = [];
    let until: string | null = null;
    let disposed = false;
    let socketOpen = false;
    let openedAt = 0;
    let pollingNow = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let inflight: Promise<boolean> | null = null;
    const controller = new AbortController();

    const apply = (incoming: TranslationSegment[]) => {
      if (incoming.length === 0) return;
      segmentsHeld = mergeSegments(segmentsHeld, incoming);
      setSegments(segmentsHeld);
    };
    const markPolling = (value: boolean) => {
      pollingNow = value;
      setPolling(value);
    };

    /** Pages through everything since the cursor (bounded). True when the API answered. */
    const catchUp = (): Promise<boolean> => {
      inflight ??= (async () => {
        try {
          for (let page = 0; page < MAX_CATCH_UP_PAGES; page += 1) {
            const response = await fetch(segmentsUrl(origin, until), { cache: "no-store", credentials: "omit", signal: controller.signal });
            if (!response.ok || disposed) return false;
            const body = parseSegmentsPage(await response.json());
            if (!body || disposed) return false;
            apply(body.segments);
            until = laterTimestamp(until, body.until);
            setService(body.state);
            if (!body.more) break;
          }
          return true;
        } catch {
          return false; // Offline or aborted: the socket's next attempt tries again.
        } finally {
          inflight = null;
        }
      })();
      return inflight;
    };

    const poll = () => {
      if (pollTimer !== null || socketOpen || disposed) return;
      pollTimer = setTimeout(() => {
        pollTimer = null;
        if (socketOpen || disposed) return;
        if (document.visibilityState === "hidden") return poll();
        void catchUp().then((ok) => {
          if (disposed || socketOpen) return;
          markPolling(ok);
          if (ok) poll();
        });
      }, POLL_INTERVAL_MS);
    };

    const socket = new LiveSocket({
      url: liveSocketUrl("/live/translation", origin),
      // The API sends a keepalive about every 25 s; nearly three missed means the socket is dead.
      idleTimeoutMs: 70_000,
      onMessage: (data) => {
        const message = parseTranslationMessage(data);
        if (!message) return;
        until = laterTimestamp(until, message.until);
        if (message.type === "status") setService(message.state);
        if (message.type !== "segment") return;
        apply([message.segment]);
        // The burst of recent segments right after connecting is history, not news for the screen reader.
        if (Date.now() - openedAt < SNAPSHOT_QUIET_MS) return;
        const merged = segmentsHeld.find((s) => segmentKey(s) === segmentKey(message.segment));
        if (merged) onLiveRef.current(merged);
      },
      onOpen: () => {
        socketOpen = true;
        openedAt = Date.now();
        if (pollTimer !== null) clearTimeout(pollTimer);
        pollTimer = null;
        markPolling(false);
        if (until !== null) void catchUp();
      },
      onClose: ({ opened }) => {
        socketOpen = false;
        if (opened) return;
        void catchUp().then((ok) => {
          if (disposed || socketOpen) return;
          markPolling(ok);
          if (ok) poll();
        });
      },
      onStateChange: (state) => {
        setSocketState(state);
        if (state.phase !== "open" && !pollingNow) setService((s) => (s === "unavailable" ? s : "unknown"));
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
      controller.abort();
      if (pollTimer !== null) clearTimeout(pollTimer);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);

  return { segments, view: translationView(socketState, service, polling) };
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
