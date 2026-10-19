"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { yieldToMain } from "../../sculpture/yield";
import { mayDropBadge, readBadgeEnvironment } from "./badge-gate";
import type { BadgeFonts } from "./BadgeCanvas";
import { BadgeFallback } from "./BadgeFallback";
import type { BadgeCard, PassArt } from "./card";

/*
 * three.js, the React bindings and Rapier stay out of the page's first load. They are fetched only
 * when the badge will run, and each large module graph is evaluated in its own task (#78).
 */
const BadgeCanvas = dynamic(
  async () => {
    await import("three");
    await yieldToMain();
    await import("@react-three/fiber");
    await yieldToMain();
    await import("@react-three/rapier");
    await yieldToMain();
    return (await import("./BadgeCanvas")).BadgeCanvas;
  },
  { ssr: false },
);

/** Long enough for the portal to paint and settle on a slow phone; short enough that the badge still drops in on arrival. */
const IDLE_TIMEOUT_MS = 2500;

class BadgeErrorBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

/**
 * The guest's name badge: a lanyard name tag printed with `card` that drops in and can be dragged
 * (the /guest/prototype design, React Three Fiber and Rapier). The server renders the CSS badge,
 * which the guest sees first and which stays under reduced motion, Save-Data, on low-power
 * devices, without (hardware) WebGL, after a render error and while the bundle loads. The 3D badge
 * mounts only after the page has loaded, the main thread is idle and the badge is on screen, so
 * the portal's first paint and its actions never wait on it. Physics pauses in a hidden tab and
 * while the badge is scrolled away. `art` is the pass QR (a promise, so the page never waits on
 * it); `labels` are the accessible names for the interactive and the static badge.
 */
export function NameBadge({ card, art, labels }: {
  card: BadgeCard;
  art?: Promise<PassArt | null>;
  labels: { interactive: string; static: string };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [allowed, setAllowed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [inView, setInView] = useState(true);
  const [pass, setPass] = useState<PassArt | null>(null);
  const [fonts, setFonts] = useState<BadgeFonts | null>(null);

  // Gate: after `load`, an idle callback and the badge being on screen; re-checked if reduced motion changes.
  useEffect(() => {
    let cancelled = false;
    let idleHandle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observer: IntersectionObserver | undefined;
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");

    const decide = () => {
      if (cancelled || !mayDropBadge(readBadgeEnvironment())) return;
      const node = ref.current;
      if (!node || typeof IntersectionObserver === "undefined") {
        setAllowed(true);
        return;
      }
      observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer?.disconnect();
        if (!cancelled) setAllowed(true);
      });
      observer.observe(node);
    };
    const whenIdle = () => {
      if (cancelled) return;
      if (typeof window.requestIdleCallback === "function") idleHandle = window.requestIdleCallback(decide, { timeout: IDLE_TIMEOUT_MS });
      else timer = setTimeout(decide, 200);
    };
    const onMotionChange = () => {
      if (motion?.matches) {
        setAllowed(false);
        setReady(false);
      } else {
        decide();
      }
    };

    if (document.readyState === "complete") whenIdle();
    else window.addEventListener("load", whenIdle, { once: true });
    motion?.addEventListener?.("change", onMotionChange);
    return () => {
      cancelled = true;
      window.removeEventListener("load", whenIdle);
      motion?.removeEventListener?.("change", onMotionChange);
      if (idleHandle !== undefined) window.cancelIdleCallback?.(idleHandle);
      if (timer !== undefined) clearTimeout(timer);
      observer?.disconnect();
    };
  }, []);

  // Pause in a hidden tab and while the badge is scrolled out of view.
  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    const node = ref.current;
    const observer = node && typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((entries) => setInView(entries.some((entry) => entry.isIntersecting)))
      : undefined;
    if (node) observer?.observe(node);
    return () => {
      document.removeEventListener("visibilitychange", update);
      observer?.disconnect();
    };
  }, []);

  // The QR for the 3D card; the CSS card reads the same promise through Suspense.
  useEffect(() => {
    if (!art) return;
    let live = true;
    art.then((value) => { if (live) setPass(value); }, () => {});
    return () => { live = false; };
  }, [art]);

  // The canvas prints with the page's own faces (Inter Tight, Geist Mono), so Vietnamese names keep their diacritics.
  useEffect(() => {
    if (!allowed || fonts || !ref.current) return;
    const style = getComputedStyle(ref.current);
    const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    setFonts({ sans: read("--font-sans", "Arial, sans-serif"), mono: read("--font-mono", "monospace") });
  }, [allowed, fonts]);

  const active = allowed && !failed && fonts !== null;
  return (
    <div ref={ref} className="name-badge" role="img" aria-label={active && ready ? labels.interactive : labels.static}>
      <div className={`name-badge__fallback${active && ready ? " is-hidden" : ""}`}>
        <BadgeFallback card={card} art={art} />
      </div>
      {active ? (
        <BadgeErrorBoundary onError={() => setFailed(true)}>
          <BadgeCanvas card={card} art={pass} fonts={fonts} onReady={setReady} visible={pageVisible && inView} />
        </BadgeErrorBoundary>
      ) : null}
    </div>
  );
}
