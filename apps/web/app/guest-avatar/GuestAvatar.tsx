"use client";

import {Blobatar} from "@blobatar/react";
import {useGaze} from "@blobatar/react/gaze";
import {useCallback, useEffect, useState} from "react";
import "blobatar/motion.css";
import "blobatar/gaze.css";
import {touchGaze} from "./touch-gaze";

type Props = {
  /** Stable, non-secret value (the guest id). Never a token or an email. */
  seed: string;
  /** Pixel size, both sides. */
  size?: number;
  /**
   * Pass the guest's name when the avatar stands alone (an accessible label); leave it out when a visible name sits next to it, and the avatar is hidden from assistive tech.
   */
  label?: string;
  className?: string;
  /** Also follow the last touch on phones (the large profile avatar, #139). */
  followTouch?: boolean;
};

/**
 * The guest's animated blobatar (#146, reused by #139). The library's gaze driver does the
 * cursor tracking: one window pointermove listener, rAF-throttled, aimed from the avatar's own
 * rect; it does not attach under prefers-reduced-motion or without a fine pointer, and the
 * motion stylesheet stills the idle animation for reduced motion. With `followTouch`, touch
 * screens get the same pursuit towards the last touch (`touch-gaze.ts`). In a hidden tab rAF
 * stops and the idle animation is paused.
 * Eye travel is in viewBox units (the face is 100 across), so ~3 reads well.
 */
export function GuestAvatar({seed, size = 28, label, className, followTouch = false}: Props) {
  const {ref: gazeRef} = useGaze({travel: 3, lookAt: "pointer"});
  const [svg, setSvg] = useState<SVGSVGElement | null>(null);
  const hidden = usePageHidden();
  const ref = useCallback(
    (node: SVGSVGElement | HTMLImageElement | null) => {
      gazeRef(node);
      setSvg(node instanceof SVGSVGElement ? node : null);
    },
    [gazeRef],
  );

  useEffect(() => (followTouch && svg ? touchGaze(svg) : undefined), [followTouch, svg]);

  return (
    <span
      className={`guest-avatar${className ? ` ${className}` : ""}`}
      aria-hidden={label ? undefined : true}
      data-paused={hidden ? "" : undefined}
    >
      <Blobatar ref={ref} name={seed} size={size} animate="always" background="circle" title={label} />
    </span>
  );
}

/** A still blobatar (an `<img>`, no motion code): for small faces in lists, such as who invited the guest. */
export function StillAvatar({seed, size = 32}: {seed: string; size?: number}) {
  return (
    <span className="guest-avatar" aria-hidden="true">
      <Blobatar name={seed} size={size} background="circle" alt="" />
    </span>
  );
}

function usePageHidden(): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const update = () => setHidden(document.visibilityState === "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return hidden;
}
