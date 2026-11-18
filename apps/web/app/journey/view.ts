import type { Translator } from "../../lib/i18n/dictionary";
import type { JourneyEntry } from "./entries";

/** At most this many photos per chapter: the flashback row holds four. */
export const MAX_PHOTOS = 4;

/** An entry with its words in the page's language: what the client component receives. */
export type JourneyEntryView = {
  file: string;
  title: string;
  date: string;
  story: string;
  video: { src: string; poster: string; label: string; captions: { en: string; vi: string } } | null;
  photos: { src: string; alt: string }[];
  /** The image behind the row's thumbnail, or "" for the empty plate. */
  thumb: string;
};

export function resolveEntries(entries: JourneyEntry[], t: Translator): JourneyEntryView[] {
  return entries.map((entry) => {
    const words = { file: entry.file, title: t(entry.titleKey), date: t(entry.dateKey), story: t(entry.storyKey) };
    if (entry.kind === "video") {
      const video = { src: entry.src, poster: entry.poster, label: t(entry.altKey), captions: entry.captions };
      return { ...words, video, photos: [], thumb: entry.poster };
    }
    const photos = entry.photos.slice(0, MAX_PHOTOS).map((photo) => ({ src: photo.src, alt: t(photo.altKey) }));
    return { ...words, video: null, photos, thumb: photos[0]?.src ?? "" };
  });
}

/**
 * Placeholders never render (docs/design/landing.md): a template value is written in square brackets,
 * "[Date, place]", "[first_year].jpg", and an empty string means "not there yet". Either one keeps
 * the piece it belongs to off the public page until the owner writes the real thing.
 */
export function isPlaceholder(value: string): boolean {
  return value.trim() === "" || /\[[^\]]*\]/.test(value);
}

/** "01_presto.jpg": rows are numbered in the order guests see them, so the list always starts at 01. */
export function numberedFile(index: number, file: string): string {
  return `${String(index + 1).padStart(2, "0")}_${file}`;
}

/**
 * The entries ready for guests: words written (filename, title, date line, story) and media in place. A film
 * needs its video and its screen-reader name; a chapter keeps only the photos that exist and are described, and
 * needs at least one. With nothing ready the landing shows its entry links instead of the band. The ready
 * entries are numbered from 01 (`numberedFile`), so a hidden film or chapter leaves no gap.
 */
export function readyEntries(entries: JourneyEntryView[]): JourneyEntryView[] {
  return readyUnnumbered(entries).map((entry, index) => ({ ...entry, file: numberedFile(index, entry.file) }));
}

function readyUnnumbered(entries: JourneyEntryView[]): JourneyEntryView[] {
  return entries.flatMap((entry) => {
    if ([entry.file, entry.title, entry.date, entry.story].some(isPlaceholder)) return [];
    if (entry.video) return entry.video.src && !isPlaceholder(entry.video.label) ? [entry] : [];
    const photos = entry.photos.filter((photo) => photo.src && !isPlaceholder(photo.alt));
    return photos.length > 0 ? [{ ...entry, photos, thumb: photos[0]?.src ?? "" }] : [];
  });
}
