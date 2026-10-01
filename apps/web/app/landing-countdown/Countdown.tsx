"use client";

import { useEffect, useState } from "react";
import { countdownParts, formatCountdown } from "./countdown-parts";

/**
 * Live countdown to the ceremony start (#148), as `13D.20H.17M.29S`. The target comes from
 * GET /event, never a literal. Renders dashes on the server and first paint (no hydration
 * mismatch), then ticks each second. role="timer" is not announced on every tick; the label
 * carries a whole-day summary. Renders nothing once the start has passed.
 */
export function Countdown({ target }: { target: string }) {
  const at = Date.parse(target);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const parts = now === null ? null : countdownParts(at, now);
  if (now !== null && parts === null) return null;

  return (
    <p
      className="home-hero-meta__cell home-countdown"
      role="timer"
      aria-label={parts ? `${parts.days} days until the ceremony` : "Countdown to the ceremony"}
    >
      <span aria-hidden="true">{parts ? formatCountdown(parts) : "--D.--H.--M.--S"}</span>
    </p>
  );
}
