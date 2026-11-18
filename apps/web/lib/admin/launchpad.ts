/**
 * The admin Overview's launchpad: every page and tool the organizers need on graduation day, in one place.
 * Pure data and helpers; the page does the fetching. Admin is English-only (#9).
 */
import { adminMediaPendingCountResponseSchema } from "@grad/contract";

export type LaunchpadPage = {
  id: string;
  name: string;
  /** One line: what the page is for. */
  purpose: string;
  /** Path on the public site, from the root. */
  path: string;
  /** What to know before opening it, when there is something. */
  note?: string;
};

export const PUBLIC_PAGES: readonly LaunchpadPage[] = [
  { id: "home", name: "Home", purpose: "The landing page: what the site is for.", path: "/" },
  { id: "wall", name: "The Wall", purpose: "Photos and wishes from everyone, as they arrive.", path: "/wall" },
  { id: "guide", name: "Guest guide", purpose: "Each guest's guide-book; needs their invitation on the device.", path: "/guide" },
  { id: "venue", name: "Venue", purpose: "Date, time, directions, campus map and calendar.", path: "/venue" },
  {
    id: "display",
    name: "Event display",
    purpose: "The projector screen: photo feed, wishes QR and captions.",
    path: "/display",
    note: "Open on the projector laptop after opening the kiosk invitation link once.",
  },
  { id: "live", name: "Live captions", purpose: "The ceremony as captions on phones, in the guest's language.", path: "/live" },
  { id: "ascii-live", name: "ASCII Live", purpose: "The camera as live ASCII art, in the browser (experimental).", path: "/ascii-live" },
  { id: "memories", name: "Memories", purpose: "The curated public archive: photos and wishes marked Public.", path: "/memories" },
  { id: "graduate", name: "Graduate portal", purpose: "Graduates sign in by email and share their guest link.", path: "/graduate" },
  { id: "docs", name: "Handbook", purpose: "The project documentation, including the event runbook.", path: "/docs" },
];

export const RUNBOOK_PATH = "/docs/operations/event-runbook";

export const PHOTOBOOTH_NOTE = "LAN only — open on the booth laptop or a tablet on the venue Wi-Fi.";

export type LaunchpadLink = LaunchpadPage & { url: string };

export type Launchpad = {
  pages: LaunchpadLink[];
  /** null when PHOTOBOOTH_PUBLIC_URL is unset or not an http(s) URL: the item is hidden. */
  photobooth: { url: string; note: string } | null;
  runbookUrl: string;
};

/** `path` on `origin`, as an absolute URL. */
export function absoluteUrl(origin: string, path: string): string {
  return new URL(path, origin).toString();
}

/** The photobooth's address from PHOTOBOOTH_PUBLIC_URL (server-only), or null when unset or not an http(s) URL. */
export function photoboothUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function buildLaunchpad(origin: string, env: { PHOTOBOOTH_PUBLIC_URL?: string }): Launchpad {
  const booth = photoboothUrl(env.PHOTOBOOTH_PUBLIC_URL);
  return {
    pages: PUBLIC_PAGES.map((page) => ({ ...page, url: absoluteUrl(origin, page.path) })),
    photobooth: booth ? { url: booth, note: PHOTOBOOTH_NOTE } : null,
    runbookUrl: absoluteUrl(origin, RUNBOOK_PATH),
  };
}

/** `promise`, or `fallback` once `ms` have passed or if it rejects: a slow status line never holds up the page. */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise.catch(() => fallback), timeout]).finally(() => clearTimeout(timer));
}

export type PendingCount = { count: number; more: boolean };

/**
 * Photos awaiting approval from `GET /admin/media/pending-count` (ADR-019), `{ pending: number }`.
 * Any failure is null and the line is hidden.
 */
export function parsePendingCount(httpStatus: number, body: unknown): PendingCount | null {
  if (httpStatus < 200 || httpStatus >= 300) return null;
  const parsed = adminMediaPendingCountResponseSchema.safeParse(body);
  return parsed.success ? { count: parsed.data.pending, more: false } : null;
}

/** "3", or "100+" when there are more pages. */
export function formatPendingCount({ count, more }: PendingCount): string {
  return more ? `${count}+` : String(count);
}
