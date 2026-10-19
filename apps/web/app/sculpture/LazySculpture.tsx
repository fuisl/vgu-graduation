"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { maySculpt, readSculptureEnvironment } from "./sculpture-gate";
import { SculptureFallback } from "./SculptureFallback";

/* three.js and the shader stay out of the landing's first load; the chunk is fetched only when it will run. */
const Sculpture = dynamic(() => import("./Sculpture").then((module) => module.Sculpture), {
  ssr: false,
  loading: () => <SculptureFallback />,
});

/** Long enough for the hero to paint and settle on a slow phone, short enough that the shapes still greet the guest. */
const IDLE_TIMEOUT_MS = 2500;

/**
 * Mounts the WebGL sculpture after the page has loaded, the main thread is idle and the hero is
 * on screen (QA P1-4). Until then, and for good when `maySculpt` says no, the server-rendered
 * `children` (the `SculptureFallback`) stay. `label` is the `landing.sculpture` message.
 */
export function LazySculpture({ label, children }: { label: string; children: ReactNode }) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let idleHandle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observer: IntersectionObserver | undefined;

    const whenVisible = () => {
      if (cancelled || !maySculpt(readSculptureEnvironment())) return;
      const slot = slotRef.current;
      if (!slot || typeof IntersectionObserver === "undefined") {
        setMounted(true);
        return;
      }
      observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer?.disconnect();
        if (!cancelled) setMounted(true);
      });
      observer.observe(slot);
    };

    const whenIdle = () => {
      if (cancelled) return;
      if (typeof window.requestIdleCallback === "function") {
        idleHandle = window.requestIdleCallback(whenVisible, { timeout: IDLE_TIMEOUT_MS });
      } else {
        timer = setTimeout(whenVisible, 200);
      }
    };

    if (document.readyState === "complete") whenIdle();
    else window.addEventListener("load", whenIdle, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", whenIdle);
      if (idleHandle !== undefined) window.cancelIdleCallback?.(idleHandle);
      if (timer !== undefined) clearTimeout(timer);
      observer?.disconnect();
    };
  }, []);

  return (
    <div ref={slotRef} className="sculpture-slot">
      {mounted ? <Sculpture label={label} /> : children}
    </div>
  );
}
