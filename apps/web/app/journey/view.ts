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
