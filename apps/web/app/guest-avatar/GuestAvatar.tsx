"use client";

import {Blobatar} from "@blobatar/react";
import {useGaze} from "@blobatar/react/gaze";
import "blobatar/motion.css";
import "blobatar/gaze.css";

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
};

/**
 * The guest's animated blobatar (#146, reused by #139). The library's gaze driver does the
 * cursor tracking: one window pointermove listener, rAF-throttled, aimed from the avatar's own
 * rect; it does not attach under prefers-reduced-motion or without a fine pointer, and the
 * motion stylesheet stills the idle animation for reduced motion. rAF also stops in a hidden tab.
 * Eye travel is in viewBox units (the face is 100 across), so ~3 reads well.
 */
export function GuestAvatar({seed, size = 28, label, className}: Props) {
  const {ref} = useGaze({travel: 3, lookAt: "pointer"});
  return (
    <span className={`guest-avatar${className ? ` ${className}` : ""}`} aria-hidden={label ? undefined : true}>
      <Blobatar ref={ref} name={seed} size={size} animate="always" background="circle" title={label} />
    </span>
  );
}
