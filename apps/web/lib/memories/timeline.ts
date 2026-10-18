import type { EventConfig, GalleryItem, Wish } from "@grad/contract";
import { eventEnd } from "../calendar/links";

/**
 * Cohort timeline (#76): curated photos and wishes in time order, split into
 * chapters. With the event configuration the ceremony day reads as Arrival,
 * Ceremony and Celebration (from `startsAt` and `endsAt`, or the calendar
 * feed's two-hour default), with anything earlier or later in "Before the day"
 * and "After the day". Without it, chapters are days, or hours when everything
 * happened on one day. Pure, so it is tested without rendering.
 */

/** VGU is in Vietnam; used only when GET /event is unavailable. */
export const DEFAULT_TIME_ZONE = "Asia/Ho_Chi_Minh";

/** Consecutive photos this close to the first of a run share one entry (a small grid), so a burst reads as one moment. */
export const PHOTO_RUN_WINDOW_MS = 30 * 60 * 1000;
/** At most this many photos per entry: two rows of three on desktop, three rows of two on a phone. */
export const PHOTO_RUN_MAX = 6;

export type TimelineEntry =
  | { kind: "photos"; id: string; at: string; photos: GalleryItem[] }
  | { kind: "wish"; id: string; at: string; wish: Wish };

export type TimelineChapter = {
  /** Stable fragment id, e.g. `ceremony` or `day-2026-11-20`. */
  id: string;
  title: string;
  /** Mono label next to the title: a time range or a date. */
  range: string;
  photoCount: number;
  wishCount: number;
  entries: TimelineEntry[];
};

export type TimelineMode = "schedule" | "day" | "hour";

export type Timeline = { mode: TimelineMode; timeZone: string; chapters: TimelineChapter[] };

type Schedule = Pick<EventConfig, "startsAt" | "endsAt" | "timeZone">;

type Item = { at: string; ms: number } & ({ kind: "photo"; photo: GalleryItem } | { kind: "wish"; wish: Wish });

function safeTimeZone(timeZone: string | undefined): string {
  if (!timeZone) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone });
    return timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** `2026-11-20` in the given zone. */
export function dayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** `09:42`, 24-hour, in the given zone. */
export function formatClock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

/** `Friday 20 November`. */
export function formatDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
}

/** `20 Nov`. */
function formatShortDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short" }).format(new Date(iso));
}

function dayRange(items: Item[], timeZone: string): string {
  const first = formatShortDay(items[0].at, timeZone);
  const last = formatShortDay(items[items.length - 1].at, timeZone);
  return first === last ? first : `${first} – ${last}`;
}

function toEntries(items: Item[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let run: { start: number; photos: GalleryItem[]; at: string } | null = null;

  const closeRun = () => {
    if (!run) return;
    entries.push({ kind: "photos", id: `photos-${run.photos[0].publicId}`, at: run.at, photos: run.photos });
    run = null;
  };

  for (const item of items) {
    if (item.kind === "wish") {
      closeRun();
      entries.push({ kind: "wish", id: `wish-${item.wish.id}`, at: item.at, wish: item.wish });
      continue;
    }
    if (run && item.ms - run.start <= PHOTO_RUN_WINDOW_MS && run.photos.length < PHOTO_RUN_MAX) {
      run.photos.push(item.photo);
    } else {
      closeRun();
      run = { start: item.ms, photos: [item.photo], at: item.at };
    }
  }
  closeRun();
  return entries;
}

function chapter(id: string, title: string, range: string, items: Item[]): TimelineChapter {
  return {
    id,
    title,
    range,
    photoCount: items.filter((item) => item.kind === "photo").length,
    wishCount: items.filter((item) => item.kind === "wish").length,
    entries: toEntries(items),
  };
}

function bySchedule(items: Item[], schedule: Schedule, timeZone: string): TimelineChapter[] {
  const start = new Date(schedule.startsAt).getTime();
  const end = eventEnd(schedule).getTime();
  const ceremonyDay = dayKey(schedule.startsAt, timeZone);
  const buckets = { before: [] as Item[], arrival: [] as Item[], ceremony: [] as Item[], celebration: [] as Item[], after: [] as Item[] };

  for (const item of items) {
    if (item.ms >= start && item.ms < end) buckets.ceremony.push(item);
    else if (dayKey(item.at, timeZone) === ceremonyDay) (item.ms < start ? buckets.arrival : buckets.celebration).push(item);
    else (item.ms < start ? buckets.before : buckets.after).push(item);
  }

  const startClock = formatClock(schedule.startsAt, timeZone);
  const endClock = formatClock(new Date(end).toISOString(), timeZone);
  const chapters: TimelineChapter[] = [];
  if (buckets.before.length) chapters.push(chapter("before", "Before the day", dayRange(buckets.before, timeZone), buckets.before));
  if (buckets.arrival.length) chapters.push(chapter("arrival", "Arrival", `Until ${startClock}`, buckets.arrival));
  if (buckets.ceremony.length) chapters.push(chapter("ceremony", "Ceremony", `${startClock}–${endClock}`, buckets.ceremony));
  if (buckets.celebration.length) chapters.push(chapter("celebration", "Celebration", `From ${endClock}`, buckets.celebration));
  if (buckets.after.length) chapters.push(chapter("after", "After the day", dayRange(buckets.after, timeZone), buckets.after));
  return chapters;
}

function byKey(items: Item[], keyOf: (item: Item) => string): Item[][] {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.values()];
}

export function buildTimeline(input: {
  photos: GalleryItem[];
  wishes: Wish[];
  /** GET /event when it answered; null falls back to days or hours. */
  event: Schedule | null;
}): Timeline {
  const timeZone = safeTimeZone(input.event?.timeZone);
  const items: Item[] = [
    ...input.photos.map((photo): Item => ({ kind: "photo", photo, at: photo.createdAt, ms: Date.parse(photo.createdAt) })),
    ...input.wishes.map((wish): Item => ({ kind: "wish", wish, at: wish.createdAt, ms: Date.parse(wish.createdAt) })),
  ]
    .filter((item) => Number.isFinite(item.ms))
    // Oldest first: a timeline reads forward. Ties keep photos before wishes, then the API's order.
    .sort((a, b) => a.ms - b.ms);

  if (items.length === 0) return { mode: input.event ? "schedule" : "day", timeZone, chapters: [] };
  if (input.event) return { mode: "schedule", timeZone, chapters: bySchedule(items, input.event, timeZone) };

  const days = byKey(items, (item) => dayKey(item.at, timeZone));
  if (days.length > 1) {
    return {
      mode: "day",
      timeZone,
      chapters: days.map((group) => {
        const key = dayKey(group[0].at, timeZone);
        return chapter(`day-${key}`, formatDay(group[0].at, timeZone), formatShortDay(group[0].at, timeZone), group);
      }),
    };
  }

  const hours = byKey(items, (item) => formatClock(item.at, timeZone).slice(0, 2));
  return {
    mode: "hour",
    timeZone,
    chapters: hours.map((group) => {
      const hour = formatClock(group[0].at, timeZone).slice(0, 2);
      return chapter(`hour-${hour}`, `${hour}:00`, formatDay(group[0].at, timeZone), group);
    }),
  };
}
