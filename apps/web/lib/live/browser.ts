"use client";

import { useEffect, useState } from "react";

type WakeLockSentinelLike = { release(): Promise<void>; addEventListener?(type: "release", cb: () => void): void };
type WakeLockLike = { request(type: "screen"): Promise<WakeLockSentinelLike> };

/**
 * Keeps the screen awake while `enabled`, where the Screen Wake Lock API exists
 * (Chrome, Edge, Safari 16.4+). Browsers release the lock when the tab is
 * hidden, so it is re-requested when the page becomes visible again. Failure
 * (unsupported, battery saver, not allowed) is silent: the page still works.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
    if (!wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let disposed = false;

    const acquire = () => {
      if (disposed || sentinel || document.visibilityState !== "visible") return;
      wakeLock
        .request("screen")
        .then((lock) => {
          if (disposed) {
            void lock.release().catch(() => {});
            return;
          }
          sentinel = lock;
          lock.addEventListener?.("release", () => {
            if (sentinel === lock) sentinel = null;
          });
        })
        .catch(() => {});
    };
    const onVisibility = () => acquire();

    acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [enabled]);
}

/** Tracks `prefers-reduced-motion: reduce`. False on the server and before mount. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * Loads and decodes an image before it goes on screen, so a slow venue network
 * never shows a half-drawn photo. Aborting drops the request (src cleared,
 * handlers detached) so superseded preloads don't pile up over hours.
 */
export function preloadImage(url: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const img = new Image();
    img.decoding = "async";
    const cleanup = () => {
      img.onload = img.onerror = null;
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      img.src = "";
      reject(new DOMException("Aborted", "AbortError"));
    };
    img.onload = () => {
      cleanup();
      // decode() can reject for images that did load (e.g. SVG in some browsers); loaded is enough.
      (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(() => resolve());
    };
    img.onerror = () => {
      cleanup();
      reject(new Error("Image failed to load"));
    };
    signal.addEventListener("abort", onAbort);
    img.src = url;
  });
}
