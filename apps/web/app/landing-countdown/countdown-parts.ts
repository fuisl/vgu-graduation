export type CountdownParts = { days: number; hours: number; minutes: number; seconds: number };

/** Whole days, hours, minutes and seconds from `now` until `target` (ms); null once it has passed. */
export function countdownParts(target: number, now: number): CountdownParts | null {
  const total = Math.floor((target - now) / 1000);
  if (!Number.isFinite(total) || total <= 0) return null;
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3_600),
    minutes: Math.floor((total % 3_600) / 60),
    seconds: total % 60,
  };
}

const pad = (value: number) => String(value).padStart(2, "0");

/** `13D.20H.17M.29S`: two-digit hours, minutes and seconds; days at least two digits. */
export function formatCountdown({ days, hours, minutes, seconds }: CountdownParts): string {
  return `${pad(days)}D.${pad(hours)}H.${pad(minutes)}M.${pad(seconds)}S`;
}
